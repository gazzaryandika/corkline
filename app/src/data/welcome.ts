import { subColumnX } from '../lib/grid';
import type { BoardDocument, CardBoardNode, EdgeKindId, NodeTypeId } from '../types';

/**
 * The "Welcome to Corkline" board: a short tour, like Miro's welcome board. Each card
 * explains its own card type and one thing to try, and the cards form a complete,
 * correctly traced chain (no flags), apart from one Insight left unlinked on purpose
 * so the amber gap flag can explain itself.
 */

function card(id: string, nodeType: NodeTypeId, y: number, title: string, body: string): CardBoardNode {
  return { id, type: 'card', position: { x: subColumnX(nodeType, 0), y }, data: { nodeType, title, body } };
}

function link(source: string, target: string, kind: EdgeKindId): BoardDocument['edges'][number] {
  return { id: `w-${source}-${target}`, type: 'relation', source, target, data: { kind } };
}

export function welcomeBoard(): BoardDocument {
  return {
    version: 1,
    brief: {
      name: 'Welcome to Corkline',
      description:
        'A two-minute tour. Read the cards from left to right: each one explains a card type and one thing to try. Edit, move or delete anything here; you can always start a fresh copy from the projects page.',
      users: '',
      context: '',
      stage: '',
      notes: 'This is the tutorial board. If someone asks the AI about it, explain how Corkline works using these cards.',
    },
    nodes: [
      card(
        'w-problem',
        'problem',
        0,
        'Start here: the problem',
        'Problem cards state the challenge your project tackles: here, that design decisions are hard to trace. Click any card to open and edit it, and drag a card by its coloured top bar. Everything saves on its own.',
      ),
      card(
        'w-assumption',
        'assumption',
        0,
        'Designers want visible reasoning',
        'Assumptions are what you take for granted before you have proof. A Problem leads to Assumptions, and each Assumption needs Evidence that supports or contradicts it.',
      ),
      card(
        'w-evidence',
        'evidence',
        0,
        '"I couldn\'t show where it came from"',
        'A (made-up) interview quote. Evidence is what you actually saw, heard or measured: a quote, an observation, a number. Type it in yourself, or open ▤ Sources to have the AI draft Evidence cards from an interview or document for you to review.',
      ),
      card(
        'w-insight',
        'insight',
        0,
        'Hidden reasoning erodes trust',
        'An Insight is your interpretation of the Evidence. To link two cards, click the dot on a card\'s edge, then click the other card and pick Leads to, Supports, Tests or Contradicts.',
      ),
      card(
        'w-gap',
        'insight',
        340,
        'This card glows amber on purpose',
        'Nothing links into this Insight, so Corkline flags it: an Insight needs Evidence behind it. Spotting gaps like this is what the tool is for. Link the Evidence card to it, or delete it. The gap count in the toolbar lists every gap on the board.',
      ),
      card(
        'w-opportunity',
        'opportunity',
        0,
        'HMW make the trail visible?',
        'An Opportunity turns an insight into a design question, often a "How might we…". Stuck? Ask the AI Assistant (bottom left) where your reasoning is weakest. It reads the whole board and suggests; you decide.',
      ),
      card(
        'w-direction',
        'direction',
        0,
        'Every card shows its basis',
        'A Direction is the route you choose. Links go one step at a time, Problem → Assumption → Evidence → Insight → Opportunity → Direction → Prototype, so anyone can trace why you chose it.',
      ),
      card(
        'w-prototype',
        'prototype',
        0,
        'Your own board',
        'A Prototype is what you build to test a Direction. After testing, open it and use "+ Add result as Evidence" to feed what you learned back in. Ready? Go back with ← Projects and start a new project.',
      ),
    ],
    edges: [
      link('w-problem', 'w-assumption', 'leads'),
      link('w-evidence', 'w-assumption', 'supports'),
      link('w-evidence', 'w-insight', 'supports'),
      link('w-insight', 'w-opportunity', 'leads'),
      link('w-opportunity', 'w-direction', 'leads'),
      link('w-direction', 'w-prototype', 'leads'),
    ],
  };
}
