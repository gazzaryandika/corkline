import { NODE_TYPE_ORDER, NODE_TYPES, SOURCE_KINDS } from '../config';
import type { CardProposal, Confidence, NodeTypeId, ProjectBrief, SourceDoc } from '../types';
import { AiError, askAi, type AiFile, type AiMode } from './client';
import { describeBrief } from './boardContext';
import { EXTRACT_KIND_GUIDANCE, EXTRACT_SYSTEM_PROMPT } from './prompts';
import { stripMarkdown } from './plainText';

/**
 * Drafts cards from one source document. Every proposal comes back with the passage
 * it rests on; for text documents we then check that passage really is in the
 * document, so the designer can see at a glance which quotes to double-check.
 */

export type ExtractContent = { text: string; truncated: boolean } | { file: AiFile };

export interface ExtractInput {
  mode: AiMode;
  doc: SourceDoc;
  content: ExtractContent;
  brief: ProjectBrief;
  /** The current board as text (describeBoard), so known points aren't proposed twice. */
  boardText: string;
}

export interface ExtractResult {
  summary: string;
  proposals: CardProposal[];
  model: string;
}

const CONFIDENCES: Confidence[] = ['high', 'medium', 'low'];

/** What Gemini must return (Gemini's Schema format). "quote" comes before "title"
 * so the model picks the passage first and writes the card from it. */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    cards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: NODE_TYPE_ORDER },
          quote: { type: 'STRING' },
          title: { type: 'STRING' },
          body: { type: 'STRING' },
          reason: { type: 'STRING' },
          confidence: { type: 'STRING', enum: CONFIDENCES },
        },
        required: ['type', 'quote', 'title', 'body', 'reason', 'confidence'],
        propertyOrdering: ['type', 'quote', 'title', 'body', 'reason', 'confidence'],
      },
    },
  },
  required: ['summary', 'cards'],
  propertyOrdering: ['summary', 'cards'],
};

export async function extractCards(input: ExtractInput): Promise<ExtractResult> {
  const sourceText = 'text' in input.content ? input.content.text : null;

  if (input.mode === 'mock') return mockExtract(input, sourceText);

  const header = [
    `PROJECT BRIEF\n${describeBrief(input.brief)}`,
    `CURRENT BOARD\n${input.boardText}`,
    `DOCUMENT KIND\n${SOURCE_KINDS[input.doc.kind].label}. ${EXTRACT_KIND_GUIDANCE[input.doc.kind]}`,
    `DOCUMENT NAME\n${input.doc.name}`,
  ].join('\n\n');

  const message =
    sourceText !== null
      ? {
          role: 'user' as const,
          text: `${header}\n\nDOCUMENT TEXT${'truncated' in input.content && input.content.truncated ? ' (cut short: the document was too long to send whole)' : ''}\n${sourceText}`,
        }
      : {
          role: 'user' as const,
          text: `${header}\n\nThe document is attached as a file.`,
          files: [(input.content as { file: AiFile }).file],
        };

  const reply = await askAi('gemini', { system: EXTRACT_SYSTEM_PROMPT, messages: [message], responseSchema: RESPONSE_SCHEMA });
  const parsed = parseReply(reply.text);
  return {
    summary: parsed.summary,
    model: reply.model,
    proposals: parsed.cards.map((c) => ({
      ...c,
      id: crypto.randomUUID(),
      suggestedType: c.nodeType,
      quoteFound: sourceText !== null ? quoteAppearsIn(c.quote, sourceText) : null,
      decision: 'pending',
    })),
  };
}

interface RawCard {
  nodeType: NodeTypeId;
  title: string;
  body: string;
  quote: string;
  reason: string;
  confidence: Confidence;
}

function parseReply(text: string): { summary: string; cards: RawCard[] } {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AiError('Gemini answered, but not in the expected format. Try reading the document again.');
  }
  const obj = (data ?? {}) as { summary?: unknown; cards?: unknown };
  const rawCards = Array.isArray(obj.cards) ? obj.cards : [];
  const cards: RawCard[] = [];
  for (const raw of rawCards) {
    const c = (raw ?? {}) as Record<string, unknown>;
    const nodeType = String(c.type ?? '').toLowerCase();
    const title = typeof c.title === 'string' ? stripMarkdown(c.title).trim() : '';
    if (!(nodeType in NODE_TYPES) || !title) continue;
    cards.push({
      nodeType: nodeType as NodeTypeId,
      title,
      body: typeof c.body === 'string' ? stripMarkdown(c.body).trim() : '',
      quote: typeof c.quote === 'string' ? c.quote.trim() : '',
      reason: typeof c.reason === 'string' ? stripMarkdown(c.reason).trim() : '',
      confidence: CONFIDENCES.includes(c.confidence as Confidence) ? (c.confidence as Confidence) : 'medium',
    });
  }
  return { summary: typeof obj.summary === 'string' ? stripMarkdown(obj.summary).trim() : '', cards };
}

function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[*_#>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the quote (or every part of it, if the AI shortened it with "…") is in the text. */
export function quoteAppearsIn(quote: string, text: string): boolean {
  const haystack = normalise(text);
  const parts = normalise(quote)
    .replace(/^["']+|["']+$/g, '')
    .split(/\.\.\.|…|\[\.\.\.\]/)
    .map((p) => p.trim().replace(/^["']+|["']+$/g, '').trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 && parts.every((p) => haystack.includes(p));
}

// ---- Mock mode: canned proposals built from the document's own sentences, no API call ----

const MOCK_TYPES: Record<SourceDoc['kind'], NodeTypeId[]> = {
  context: ['problem', 'assumption', 'problem', 'evidence'],
  interview: ['evidence'],
  observation: ['evidence'],
  research: ['evidence', 'assumption'],
  workshop: ['insight', 'opportunity', 'evidence', 'assumption'],
  other: ['evidence', 'problem', 'assumption'],
};

async function mockExtract(input: ExtractInput, sourceText: string | null): Promise<ExtractResult> {
  await new Promise((r) => setTimeout(r, 900));
  const types = MOCK_TYPES[input.doc.kind];

  if (sourceText === null) {
    return {
      model: 'mock',
      summary: `[Mock: no model was called] "${input.doc.name}" is a file Mock mode can't read. Switch to Gemini to read it.`,
      proposals: [
        mockProposal(types[0], `Mock card from ${input.doc.name}`, '(mock mode: the file was not read)', null),
      ],
    };
  }

  const sentences = sourceText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 280);
  const picked = sentences.slice(0, 4);
  return {
    model: 'mock',
    summary: `[Mock: no model was called] Proposals below are just the first ${picked.length} sentences of "${input.doc.name}", typed in rotation.`,
    proposals: picked.map((s, i) => {
      const words = s.split(/\s+/);
      const title = words.slice(0, 9).join(' ') + (words.length > 9 ? '…' : '');
      return mockProposal(types[i % types.length], title, s, quoteAppearsIn(s, sourceText));
    }),
  };
}

function mockProposal(nodeType: NodeTypeId, title: string, quote: string, quoteFound: boolean | null): CardProposal {
  return {
    id: crypto.randomUUID(),
    nodeType,
    suggestedType: nodeType,
    title,
    body: '',
    quote,
    reason: 'Mock mode: picked without reading.',
    confidence: 'low',
    quoteFound,
    decision: 'pending',
  };
}
