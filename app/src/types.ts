export type NodeTypeId =
  | 'problem'
  | 'evidence'
  | 'insight'
  | 'opportunity'
  | 'direction'
  | 'prototype'
  | 'assumption';

export type EdgeKindId = 'leads' | 'supports' | 'tests' | 'contradicts';

export interface NodeTypeConfig {
  id: NodeTypeId;
  label: string;
  short: string;
  color: string;
  placeholder: string;
  needsIncoming: boolean;
}

export interface EdgeKindConfig {
  id: EdgeKindId;
  label: string;
  color: string;
  arrow: boolean;
}

export interface CardData {
  nodeType: NodeTypeId;
  title: string;
  body: string;
  /** Optional reference link (source document, recording, appendix, etc). */
  link?: string;
  /** Optional thumbnail, stored as a downscaled data URL (see lib/image.ts). */
  image?: string;
  /** Set when the card was drafted from a source document and approved by the designer. */
  source?: CardSource;
  [key: string]: unknown;
}

/** Where a card came from. Name and quote are copied onto the card so they survive
 * the document being deleted or the board being exported without its files. */
export interface CardSource {
  docId: string;
  docName: string;
  /** The passage in the document this card is based on, as quoted by the AI. */
  quote: string;
  /** The card type the AI proposed, so a designer's correction stays visible. */
  aiType?: NodeTypeId;
}

export interface RelationData {
  kind: EdgeKindId;
  [key: string]: unknown;
}

export interface GroupData {
  label: string;
  /** For a theme the AI proposed: one sentence on what its cards have in common. */
  description?: string;
  [key: string]: unknown;
}

/** A theme the AI found among cards of one type, waiting for the designer's review. */
export interface ThemeProposal {
  id: string;
  nodeType: NodeTypeId;
  name: string;
  description: string;
  cardIds: string[];
  decision: 'pending' | 'accepted' | 'rejected';
}

export interface CardBoardNode {
  id: string;
  type: 'card';
  position: { x: number; y: number };
  /** Set when this card belongs to a group frame. */
  parentId?: string;
  data: CardData;
}

export interface GroupBoardNode {
  id: string;
  type: 'group';
  position: { x: number; y: number };
  width: number;
  height: number;
  data: GroupData;
}

/** An AI summary of some cards (or the whole board), shown as a yellow note. Not a card:
 * it isn't evidence, isn't sent to the AI as part of the board, and can't be linked. */
export interface NoteData {
  title: string;
  body: string;
  /** When the summary was written (ms since epoch). */
  createdAt: number;
  /** The cards it summarises, so clicking the note can highlight them. */
  sourceCardIds: string[];
  scope: 'selection' | 'board';
  /** Model that wrote it ('mock' for canned text). */
  model: string;
  [key: string]: unknown;
}

export interface NoteBoardNode {
  id: string;
  type: 'note';
  position: { x: number; y: number };
  data: NoteData;
}

export type BoardNode = CardBoardNode | GroupBoardNode | NoteBoardNode;

/** What the project is about. Shown in the Project panel and sent to the AI with every request. */
export interface ProjectBrief {
  name: string;
  description: string;
  users: string;
  context: string;
  stage: string;
  notes: string;
}

export type SourceKindId = 'context' | 'interview' | 'observation' | 'research' | 'workshop' | 'other';

export type Confidence = 'high' | 'medium' | 'low';

/** A card the AI drafted from a document, waiting for the designer to accept, edit or reject it. */
export interface CardProposal {
  id: string;
  nodeType: NodeTypeId;
  /** The type the AI proposed; nodeType is what the designer has chosen. Missing on proposals saved before this existed. */
  suggestedType?: NodeTypeId;
  title: string;
  body: string;
  quote: string;
  /** Why the AI thinks this passage is this card type. */
  reason: string;
  confidence: Confidence;
  /** true: the quote was found in the document's text; false: it wasn't;
   * null: couldn't be checked (PDF, image, audio). */
  quoteFound: boolean | null;
  decision: 'pending' | 'accepted' | 'rejected';
}

/**
 * A document added to the project (context brief, transcript, notes…). Only this
 * metadata is saved with the board; the file itself lives in IndexedDB
 * (lib/fileStore.ts), because localStorage is far too small for documents.
 */
export interface SourceDoc {
  id: string;
  name: string;
  kind: SourceKindId;
  mimeType: string;
  size: number;
  addedAt: number;
  /** Set when the source was read from a link (web page, PDF link, YouTube video). */
  url?: string;
  /** When the AI last read it. */
  readAt?: number;
  /** The AI's one- or two-sentence description of what the document contains. */
  summary?: string;
  /** Model that did the last read ('mock' for canned proposals). */
  model?: string;
  /** Proposals from the last read. Kept until the review is finished, so closing the panel loses nothing. */
  proposals?: CardProposal[];
  /** Counts from finished reviews, for the sources list. */
  acceptedCount?: number;
  rejectedCount?: number;
}

export interface BoardDocument {
  version: 1;
  /** Optional so boards saved before the brief existed still load. */
  brief?: ProjectBrief;
  /** Optional so boards saved before documents could be added still load. */
  sources?: SourceDoc[];
  nodes: BoardNode[];
  edges: Array<{ id: string; type: 'relation'; source: string; target: string; data: RelationData }>;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
