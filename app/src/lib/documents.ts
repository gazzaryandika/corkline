/**
 * Recognising and reading the documents a designer adds as sources.
 *
 * - Text and Markdown are read as text in the browser.
 * - Word (.docx) is converted to plain text in the browser (mammoth).
 * - PDF, images and audio are sent to Gemini as files, which reads (or listens to) them itself.
 */

export type FileCategory = 'text' | 'docx' | 'pdf' | 'image' | 'audio' | 'video';

/** Stored type of a YouTube link source. There's no file: Gemini watches the video itself. */
export const YOUTUBE_MIME_TYPE = 'video/youtube';

interface FileTypeInfo {
  category: FileCategory;
  mimeType: string;
}

const BY_EXTENSION: Record<string, FileTypeInfo> = {
  txt: { category: 'text', mimeType: 'text/plain' },
  md: { category: 'text', mimeType: 'text/markdown' },
  markdown: { category: 'text', mimeType: 'text/markdown' },
  csv: { category: 'text', mimeType: 'text/csv' },
  docx: { category: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf: { category: 'pdf', mimeType: 'application/pdf' },
  png: { category: 'image', mimeType: 'image/png' },
  jpg: { category: 'image', mimeType: 'image/jpeg' },
  jpeg: { category: 'image', mimeType: 'image/jpeg' },
  webp: { category: 'image', mimeType: 'image/webp' },
  heic: { category: 'image', mimeType: 'image/heic' },
  heif: { category: 'image', mimeType: 'image/heif' },
  mp3: { category: 'audio', mimeType: 'audio/mp3' },
  wav: { category: 'audio', mimeType: 'audio/wav' },
  m4a: { category: 'audio', mimeType: 'audio/mp4' },
  aac: { category: 'audio', mimeType: 'audio/aac' },
  ogg: { category: 'audio', mimeType: 'audio/ogg' },
  flac: { category: 'audio', mimeType: 'audio/flac' },
  aiff: { category: 'audio', mimeType: 'audio/aiff' },
};

/** For the file picker's `accept` attribute. */
export const ACCEPTED_EXTENSIONS = Object.keys(BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(',');

/** Files sent to Gemini whole travel inside one request, which Google caps at 20 MB
 * (and base64 makes them a third bigger), so stay safely under that. */
export const MAX_FILE_BYTES = 14 * 1024 * 1024;

/** Very long texts are cut here before being sent. Roughly 75k words. */
export const MAX_TEXT_CHARS = 400_000;

/** Pasted text is stored under this type, so it reads like a .txt file. */
export const PASTED_MIME_TYPE = 'text/plain';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Works out what kind of file this is from its name, since browsers often leave
 * `File.type` empty for things like Markdown. Returns null for unsupported files. */
export function detectFileType(name: string, mimeType = ''): FileTypeInfo | null {
  const byExt = BY_EXTENSION[extensionOf(name)];
  if (byExt) return byExt;
  if (mimeType.startsWith('text/')) return { category: 'text', mimeType };
  return null;
}

/** Category of a stored source, from the type recorded when it was added (its name can be renamed freely). */
export function categoryOf(mimeType: string): FileCategory {
  if (mimeType === BY_EXTENSION.docx.mimeType) return 'docx';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'text';
}

/** Why a file can't be added, or null if it can. */
export function checkFile(file: File): string | null {
  const ext = extensionOf(file.name);
  if (ext === 'doc') return `"${file.name}" is an old Word file (.doc). Save it as .docx or PDF and add that instead.`;
  if (!detectFileType(file.name, file.type)) {
    return `"${file.name}" isn't a supported file type. Use PDF, Word (.docx), text, Markdown, an image or audio.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is ${formatSize(file.size)}. The limit is ${formatSize(MAX_FILE_BYTES)}; split it or export a smaller version.`;
  }
  return null;
}

/** Text content of a text or Word file. */
export async function extractText(blob: Blob, category: FileCategory): Promise<string> {
  if (category === 'text') return blob.text();
  if (category === 'docx') {
    const mammoth = await import('mammoth');
    try {
      const result = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() });
      return result.value;
    } catch {
      throw new Error('Could not read that Word file. Try saving it again as .docx or exporting it as PDF.');
    }
  }
  throw new Error(`No text extraction for ${category} files.`);
}

export async function toBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** File name without its extension, as a starting name for the source. */
export function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
