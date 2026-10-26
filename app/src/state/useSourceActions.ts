import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useAiMode } from '../ai/mode';
import { extractCards, type ExtractContent } from '../ai/extract';
import { describeBoard } from '../ai/boardContext';
import {
  MAX_TEXT_CHARS,
  PASTED_MIME_TYPE,
  YOUTUBE_MIME_TYPE,
  baseName,
  categoryOf,
  checkFile,
  detectFileType,
  extractText,
  toBase64,
  type FileCategory,
} from '../lib/documents';
import { deleteFile, getFile, putFile, saveExtractedText } from '../lib/fileStore';
import { fetchLink, isYouTube, normaliseLink } from '../lib/links';
import type { BoardState } from './useBoardState';
import type { SourceDoc, SourceKindId } from '../types';

/**
 * Adding sources (files, pasted text, links) and having the AI read them. Lives at
 * board level, not in the Sources panel, so a read keeps going while the panel is
 * closed and the chat can start one too (when the designer pastes a link).
 */

export type ReadState = { status: 'reading' } | { status: 'error'; message: string };
export type ReadResult = { ok: true; proposals: number } | { ok: false; error: string };

/** A sensible starting kind, from the name and type. The designer can change it. */
export function guessKind(name: string, category: FileCategory, isFirst: boolean): SourceKindId {
  const n = name.toLowerCase();
  if (/interview|transcript/.test(n)) return 'interview';
  if (/observ|field|safari/.test(n)) return 'observation';
  if (/brief|context|assignment|challenge/.test(n)) return 'context';
  if (/workshop|sticky|whiteboard|post-?it/.test(n)) return 'workshop';
  if (/research|report|paper|study|survey|article/.test(n)) return 'research';
  if (category === 'audio') return 'interview';
  if (category === 'image') return 'workshop';
  return isFirst ? 'context' : 'other';
}

export function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function useSourceActions(board: BoardState, projectId: string) {
  const [mode] = useAiMode();
  const [reads, setReads] = useState<Record<string, ReadState>>({});

  // Latest board, for work that finishes after the board has changed.
  const boardRef = useRef(board);
  useLayoutEffect(() => {
    boardRef.current = board;
  });

  const setRead = useCallback(
    (id: string, state: ReadState | null) =>
      setReads((prev) => {
        const next = { ...prev };
        if (state) next[id] = state;
        else delete next[id];
        return next;
      }),
    [],
  );

  /** Stores and lists each file; returns a message for every file that couldn't be added. */
  const addFiles = useCallback(
    async (files: File[]): Promise<string[]> => {
      const errors: string[] = [];
      let isFirst = boardRef.current.sources.length === 0;
      for (const file of files) {
        const problem = checkFile(file);
        if (problem) {
          errors.push(problem);
          continue;
        }
        const info = detectFileType(file.name, file.type)!;
        const doc: SourceDoc = {
          id: crypto.randomUUID(),
          name: baseName(file.name),
          kind: guessKind(file.name, info.category, isFirst),
          mimeType: info.mimeType,
          size: file.size,
          addedAt: Date.now(),
        };
        try {
          await putFile(projectId, doc.id, file);
          boardRef.current.addSource(doc);
          isFirst = false;
        } catch (err) {
          errors.push(`Couldn't store "${file.name}": ${(err as Error).message}`);
        }
      }
      return errors;
    },
    [projectId],
  );

  const addPasted = useCallback(
    async (name: string, kind: SourceKindId, text: string): Promise<SourceDoc> => {
      const blob = new Blob([text], { type: PASTED_MIME_TYPE });
      const doc: SourceDoc = {
        id: crypto.randomUUID(),
        name: name.trim() || `Pasted notes, ${shortDate(Date.now())}`,
        kind,
        mimeType: PASTED_MIME_TYPE,
        size: blob.size,
        addedAt: Date.now(),
      };
      await putFile(projectId, doc.id, blob, text);
      boardRef.current.addSource(doc);
      return doc;
    },
    [projectId],
  );

  /** Fetches a link and lists it as a source. Web pages are stored as their readable
   * text, PDFs and images as files; YouTube videos aren't fetched (Gemini watches them).
   * `kind` defaults to a guess from the page title. Throws a readable message on failure. */
  const addLink = useCallback(
    async (rawUrl: string, kind?: SourceKindId): Promise<SourceDoc> => {
      const url = normaliseLink(rawUrl);
      const isFirst = boardRef.current.sources.length === 0;
      const base = { id: crypto.randomUUID(), addedAt: Date.now(), url };

      if (isYouTube(url)) {
        const u = new URL(url);
        const videoId = u.searchParams.get('v') ?? u.pathname.split('/').filter(Boolean).pop() ?? '';
        const doc: SourceDoc = {
          ...base,
          // Replaced by the video's real title once Gemini has watched it.
          name: `YouTube video ${videoId}`.trim(),
          kind: kind ?? 'research',
          mimeType: YOUTUBE_MIME_TYPE,
          size: 0,
        };
        boardRef.current.addSource(doc);
        return doc;
      }

      const fetched = await fetchLink(url);
      if (fetched.kind === 'text') {
        const blob = new Blob([fetched.text], { type: PASTED_MIME_TYPE });
        const doc: SourceDoc = {
          ...base,
          url: fetched.finalUrl,
          name: fetched.title,
          kind: kind ?? guessKind(fetched.title, 'text', isFirst),
          mimeType: PASTED_MIME_TYPE,
          size: blob.size,
        };
        await putFile(projectId, doc.id, blob, fetched.text);
        boardRef.current.addSource(doc);
        return doc;
      }
      const doc: SourceDoc = {
        ...base,
        url: fetched.finalUrl,
        name: baseName(fetched.title),
        kind: kind ?? guessKind(fetched.title, categoryOf(fetched.mimeType), isFirst),
        mimeType: fetched.mimeType,
        size: fetched.blob.size,
      };
      await putFile(projectId, doc.id, fetched.blob);
      boardRef.current.addSource(doc);
      return doc;
    },
    [projectId],
  );

  const readSource = useCallback(
    async (doc: SourceDoc): Promise<ReadResult> => {
      setRead(doc.id, { status: 'reading' });
      try {
        const category = categoryOf(doc.mimeType);
        let content: ExtractContent;
        if (category === 'video') {
          if (!doc.url) throw new Error('This video source has no link.');
          content = { file: { fileUri: doc.url } };
        } else {
          const record = await getFile(projectId, doc.id);
          if (!record) {
            throw new Error(
              "This document's file isn't stored in this browser (projects imported from JSON don't include files). Delete it and add the file again.",
            );
          }
          if (category === 'text' || category === 'docx') {
            let text = record.text;
            if (text === undefined) {
              text = await extractText(record.blob, category);
              await saveExtractedText(projectId, doc.id, text).catch(() => undefined);
            }
            if (!text.trim()) throw new Error('No text was found in this document.');
            content = { text: text.slice(0, MAX_TEXT_CHARS), truncated: text.length > MAX_TEXT_CHARS };
          } else {
            content = { file: { mimeType: doc.mimeType, data: mode === 'gemini' ? await toBase64(record.blob) : '' } };
          }
        }

        const current = boardRef.current;
        const result = await extractCards({
          mode,
          doc,
          content,
          brief: current.brief,
          boardText: describeBoard(current.nodes, current.edges, current.gapIds),
        });
        current.updateSource(doc.id, {
          readAt: Date.now(),
          summary: result.summary,
          model: result.model,
          proposals: result.proposals,
          // Videos are only known by their link until Gemini has watched them.
          ...(category === 'video' && result.title ? { name: result.title } : {}),
        });
        setRead(doc.id, null);
        return { ok: true, proposals: result.proposals.length };
      } catch (err) {
        const message = (err as Error).message;
        setRead(doc.id, { status: 'error', message });
        return { ok: false, error: message };
      }
    },
    [projectId, mode, setRead],
  );

  const removeSource = useCallback(
    (doc: SourceDoc) => {
      boardRef.current.removeSource(doc.id);
      setRead(doc.id, null);
      deleteFile(projectId, doc.id).catch(() => undefined);
    },
    [projectId, setRead],
  );

  const readingCount = Object.values(reads).filter((r) => r.status === 'reading').length;

  return { reads, readingCount, addFiles, addPasted, addLink, readSource, removeSource };
}

export type SourceActions = ReturnType<typeof useSourceActions>;
