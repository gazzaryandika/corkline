import { Readability } from '@mozilla/readability';
import { detectFileType, MAX_TEXT_CHARS } from './documents';

/**
 * Reading links as sources. The dev server fetches the page (server/linkFetcher.ts,
 * the browser can't because of CORS); here the result becomes either readable
 * text (web pages, via Mozilla Readability, the engine behind Firefox's Reader
 * View) or a file (PDF, image), the same as an upload. YouTube links aren't
 * fetched at all: Gemini watches public videos itself.
 */

/** Pages with less readable text than this are probably behind a login or built by JavaScript. */
const MIN_PAGE_CHARS = 200;

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+/gi;

/** Links in a chat message, cleaned of trailing punctuation, at most three. */
export function findLinks(text: string): string[] {
  const found = (text.match(URL_IN_TEXT) ?? [])
    .map((raw) => raw.replace(/[).,;:!?\]]+$/, ''))
    .map((raw) => (raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw))
    .filter((raw) => {
      try {
        new URL(raw);
        return true;
      } catch {
        return false;
      }
    });
  return [...new Set(found)].slice(0, 3);
}

/** Text of a message with its links taken out, to see whether anything else was asked. */
export function withoutLinks(text: string): string {
  return text.replace(URL_IN_TEXT, '').trim();
}

export function normaliseLink(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isYouTube(url: string): boolean {
  return /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|youtu\.be\/)/.test(url);
}

/** Short readable form of a link for lists: host + path, no protocol. */
export function displayLink(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    // YouTube keeps the video id in the query (?v=…), which is the only useful part.
    const query = u.hostname.endsWith('youtube.com') ? u.search : '';
    const shown = `${u.hostname.replace(/^www\./, '')}${path}${query}`;
    return shown.length > 60 ? `${shown.slice(0, 57)}…` : shown;
  } catch {
    return url;
  }
}

export type FetchedLink =
  | { kind: 'text'; title: string; text: string; finalUrl: string }
  | { kind: 'file'; title: string; blob: Blob; mimeType: string; finalUrl: string };

export async function fetchLink(url: string): Promise<FetchedLink> {
  let response: Response;
  try {
    response = await fetch(`/api/fetch-url?url=${encodeURIComponent(url)}`);
  } catch {
    throw new Error('Could not reach the Corkline dev server. Is `npm run dev` still running?');
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Couldn't fetch that link (HTTP ${response.status}).`);
  }

  const finalUrl = decodeURI(response.headers.get('X-Final-Url') ?? url);
  const contentType = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  const fileName = decodeURIComponent(new URL(finalUrl).pathname.split('/').pop() || '') || new URL(finalUrl).hostname;

  if (contentType === 'text/html' || contentType === 'application/xhtml+xml') {
    return { kind: 'text', finalUrl, ...readablePage(await response.text(), finalUrl) };
  }
  if (contentType.startsWith('text/')) {
    const text = await response.text();
    if (!text.trim()) throw new Error('That link is empty.');
    return { kind: 'text', title: fileName, text: text.slice(0, MAX_TEXT_CHARS), finalUrl };
  }

  // PDF, images, audio: treat like an uploaded file. Prefer the server's type, then the file name.
  const known = detectFileType(fileName, contentType);
  const mimeType =
    contentType === 'application/pdf' || contentType.startsWith('image/') || contentType.startsWith('audio/')
      ? contentType
      : known && known.category !== 'text'
        ? known.mimeType
        : null;
  if (!mimeType || mimeType.includes('wordprocessingml')) {
    throw new Error(
      `That link is a ${contentType || 'file'} Corkline can't read from a link. Download it and add it as a file instead.`,
    );
  }
  return { kind: 'file', title: fileName, blob: await response.blob(), mimeType, finalUrl };
}

function readablePage(html: string, url: string): { title: string; text: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Readability resolves relative links against the page address.
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);

  const pageTitle = doc.title.trim();
  const article = new Readability(doc.cloneNode(true) as Document).parse();
  let text = article?.textContent ?? '';
  if (text.trim().length < MIN_PAGE_CHARS) {
    doc.querySelectorAll('script, style, noscript, nav, header, footer, svg').forEach((el) => el.remove());
    text = doc.body?.textContent ?? '';
  }
  text = text
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length < MIN_PAGE_CHARS) {
    throw new Error(
      "Couldn't find readable text on that page. It may need a login or be built with JavaScript; copy the text and use Paste text instead.",
    );
  }
  return {
    title: (article?.title || pageTitle || new URL(url).hostname).trim().slice(0, 120),
    text: text.slice(0, MAX_TEXT_CHARS),
  };
}
