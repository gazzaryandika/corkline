/**
 * Safety net for chat replies: the system prompt asks for plain text, but models
 * sometimes slip into Markdown anyway. Strips the common markers so the bubble
 * never shows raw ** or # symbols.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[a-z]*\n?/gi, '') // code fences
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^(\s*)[*+]\s+/gm, '$1- ') // "* item" / "+ item" bullets → "- item"
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/__(.+?)__/g, '$1') // __bold__
    .replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1$2') // *italic*
    .replace(/(^|[^\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1$2') // _italic_ (leaves snake_case alone)
    .replace(/`([^`]+)`/g, '$1'); // `code`
}
