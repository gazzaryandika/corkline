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
  [key: string]: unknown;
}

export interface RelationData {
  kind: EdgeKindId;
  [key: string]: unknown;
}

export interface GroupData {
  label: string;
  [key: string]: unknown;
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

export type BoardNode = CardBoardNode | GroupBoardNode;

/** What the project is about. Shown in the Project panel and sent to the AI with every request. */
export interface ProjectBrief {
  name: string;
  description: string;
  users: string;
  context: string;
  stage: string;
  notes: string;
}

export interface BoardDocument {
  version: 1;
  /** Optional so boards saved before the brief existed still load. */
  brief?: ProjectBrief;
  nodes: BoardNode[];
  edges: Array<{ id: string; type: 'relation'; source: string; target: string; data: RelationData }>;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
