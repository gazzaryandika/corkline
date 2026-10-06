# Corkline

A node-based canvas for tracing a design process: typed cards (Problem, Evidence, Insight, Opportunity,
Direction, Prototype, Assumption) connected by labeled relationships (Leads to / Supports / Tests /
Contradicts). Cards that need evidence behind them but have nothing feeding in are flagged automatically.

This is the React + TypeScript rebuild of the original single-file `corkline.html` prototype (kept one
level up, at the repo root, as a historical reference). It runs as a real local web app on Vite instead
of being opened directly as a file.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (typically `http://localhost:5173`).

Other scripts:

- `npm run build` — type-checks (`tsc -b`) and produces a production build in `dist/`.
- `npm run lint` — runs oxlint over the source.
- `npm run preview` — serves the production build locally.

## How it's organized

- `src/types.ts`, `src/config.ts` — the node-type and edge-kind definitions (colors, labels, placeholder
  text, which types require an incoming link).
- `src/data/seed.ts` — the example hospital-waiting-room board shown on first launch.
- `src/state/useBoardState.ts` — all board data and mutations (add/update/delete cards and relationships,
  gap detection, debounced localStorage persistence, export/import).
- `src/board/` — the canvas itself, built on [React Flow](https://reactflow.dev) (`@xyflow/react`):
  `CardNode` (the card component), `RelationEdge` (the connection lines + labels), `BoardCanvas` (wires
  it all together, including the click-to-arm-then-click-to-finish connection flow), `EdgeKindMenu` (the
  popup for picking a relationship kind).
- `src/components/` — the toolbar, the legend panel, and the save-status / cross-tab banners.

## What changed from the original prototype

The original `corkline.html` was reviewed for bugs before this rebuild; every one of them was addressed
as part of the new architecture rather than patched on top of the old code:

- **Card and edge ids are now `crypto.randomUUID()`**, not a counter that reset to 1 on every page reload.
  The old counter caused ids to collide across sessions, which could silently delete or misattribute the
  wrong card or relationship.
- **Card titles/bodies are real `<input>`/`<textarea>` elements**, not `contentEditable` divs, so typed or
  pasted line breaks are preserved instead of being silently flattened on save.
- **Panning, zooming, dragging, and connecting are handled by React Flow**, which has real touch support,
  doesn't redraw every edge on every drag frame, and doesn't hard-code pixel offsets that break on narrow
  windows.
- **A failed save is no longer silent.** The toolbar shows saving / saved / a visible error state, and
  Export/Import buttons give you an actual JSON backup instead of trusting `localStorage` alone.
- **Relationships between the same two cards no longer draw exactly on top of each other** — each gets
  its own lane so every label stays visible and clickable.
- Editing in one browser tab now warns you if the board changed in another tab, instead of one tab
  silently overwriting the other's work on next save.

## Projects

The app opens on a **Projects page** listing every project, with New, From example, Import, Duplicate,
Export and Delete. Each project has its own board and Project brief. Everything is stored in this
browser's localStorage only, so use Export to back a project up or move it to another computer.

- `src/pages/ProjectsPage.tsx`: the projects page.
- `src/lib/route.ts`: a tiny hash router (`#/` for projects, `#/project/<id>` for a board).
- `src/BoardScreen.tsx`: one project's board (toolbar, canvas, legend, chat).
- `src/lib/storage.ts`: the project list plus a per-project board, and a one-time migration of the old
  single board.

## AI (Google Gemini)

The AI Assistant panel (bottom left) has two modes:

- **Mock**: canned replies, no API call, free. Use it while building UI.
- **Gemini**: a real call to Google's Gemini API.

The browser never sees the API key. It posts to `/api/ai/chat` on the Vite dev server
(`server/aiProxy.ts`), which adds the key and forwards the request to Google. Failed calls show up as
red messages with a Retry button; they are never hidden or faked.

To enable Gemini: copy `.env.example` to `.env.local`, paste a free key from
https://aistudio.google.com/apikey into `GEMINI_API_KEY`, and restart `npm run dev`. `.env.local` is
git-ignored. Optionally set `GEMINI_MODEL` to change the model.

- `src/ai/client.ts`: `askAi(mode, request)`, the single entry point every AI feature uses.
- `src/ai/boardContext.ts`: writes the board out as text (cards named by type + title, e.g. Insight "…", relationships, gaps,
  selection) for the model to read.
- Project brief (toolbar → ✎ Project): name, description, users, client/setting, stage and notes,
  saved with the board and sent to the AI before the board on every question.
- `src/ai/prompts.ts`: the system instructions defining the AI's role (inspect reasoning, don't invent ideas).
- `src/ai/mode.ts`: the shared Mock / Gemini switch and model choice, so the chat and the Sources panel
  always agree.

**Model picker.** In Gemini mode, a dropdown next to Mock / Gemini (in the chat and the Sources panel)
picks the model. The list comes from `/api/ai/models`, which asks Google which models the API key can
use and keeps only Gemini text-chat models (no image, speech or robotics models); it's cached for 10
minutes. `GEMINI_MODEL` from `.env.local` is the "(default)". The choice is remembered in the browser
and sent with each request; the proxy only accepts names matching `CHAT_MODEL_PATTERN`. Google lists
some models it then refuses for newer keys (e.g. `gemini-2.5-flash`); when that happens the model is
greyed out as "(not available)" and the app switches back to the default. Lite models have much higher
free-tier limits, which helps when testing. `src/components/ModelPicker.tsx` is the dropdown.

The proxy retries automatically (twice, after 2 s and 6 s) when Google answers 503 "high demand", which
happens often on the free tier, before showing an error.

## Sources: documents → draft cards

Toolbar → **▤ Sources** (or **Add a document** on an empty board) opens the Sources panel. The designer
adds the documents behind the project, the AI reads each one and proposes cards, and the designer reviews
them. Nothing reaches the board without being accepted.

1. **Add**: drop or choose files, or paste text. Supported: PDF, Word (.docx), .txt / .md / .csv,
   images (PNG, JPG, WebP, HEIC), audio (MP3, WAV, M4A, AAC, OGG, FLAC, AIFF), up to 14 MB each. Each
   document gets a **kind** (Project context, Interview, Observation, Research, Workshop, Other), guessed
   from the file name and editable. The kind tells the AI which card types to look for.
2. **Read with AI**: text and Word are converted to text in the browser (Word via `mammoth`, loaded
   only when needed); PDF, images and audio are sent to Gemini as files. Gemini returns JSON (a
   response schema) with a summary of the document and proposed cards, each with type, title, body,
   the **verbatim quote** it rests on, a one-line reason and a confidence. The current brief and board
   go along, so points already on the board aren't proposed again.
3. **Review**: every proposal can be retyped, edited, accepted or rejected (or Accept all / Reject
   all). For text and Word documents Corkline checks each quote really is in the document and marks
   any it can't find with ⚠. PDF, image and audio quotes are marked "not checked automatically".
   Unfinished reviews are saved, so closing the panel loses nothing.
4. **Add to board**: accepted cards go in a new band below the board, one fixed column per card type,
   so the board reads top to bottom in the order documents were added. Each card remembers its
   source (document name + quote), shown on the card and in its full view.

**Links.** Paste a link in the AI Assistant and it offers **Read as source** (with a kind picker); the
Sources panel has **Add link** too. Both fetch, list and read the link in one go, and the chat shows
progress and a **Review cards** button that opens the panel on that review. If the message also asks
something, the chat still answers it (the chat AI is told it can't open links itself).

- Web pages: the dev server fetches the page (`server/linkFetcher.ts`, `GET /api/fetch-url?url=…`,
  since the browser can't because of CORS), then the browser extracts the article text with Mozilla
  Readability (`src/lib/links.ts`) and stores it as a text source, so the quote check works. Menus,
  footers and the like are dropped. Pages with too little readable text (logins, JavaScript-built
  pages) are refused with a "copy the text and use Paste text" message.
- Links to PDFs or images are downloaded and stored like uploaded files.
- YouTube links aren't fetched: the proxy passes them to Gemini as `fileData`, which watches public
  videos itself. The source is renamed to the video's title after the read.
- Accepted cards from a link get it in their **Link** field, so the full view's Open button goes back
  to the page.
- Safety: the fetcher only fetches public http(s) addresses on the standard ports, refuses anything
  resolving to this computer or a private network (checked again at every redirect), and stops at
  14 MB / 20 s. The address is checked just before fetching rather than pinned, which is fine for a
  local dev tool but not for a public server.

Adding and reading sources lives in `src/state/useSourceActions.ts` (at board level), so reads keep
going while the panel is closed and the chat can start them.

## Themes: AI-suggested groups of cards

**✦ Find themes** (under the AI Assistant's messages) asks the AI which cards share a theme, like
clustering sticky notes in an affinity map. Rules (in `THEMES_SYSTEM_PROMPT`, `src/ai/prompts.ts`):
themes only group cards of the **same type**; at least two cards each; every card in at most one theme
(its strongest); cards with no shared thread are left out; nothing new is invented. Only cards that
aren't in a group frame yet are considered, so the designer's own groups are left alone.

**On a selection:** select cards first (⌘/Ctrl-click or Shift-drag) and the button becomes "✦ Find
themes in N selected": only those cards are considered, including ones already in a group. Typing a
request such as "are there any themes in these?" or "find themes" does the same (`isThemeRequest` in
`ChatPanel.tsx`) instead of a normal chat answer. When the cards share no thread the AI says so, with a
one-sentence reason (`note` in the response): "No themes among the 3 selected cards. …".

The chat shows the result ("Found 3 themes among 13 cards") with **Review themes**, which opens
`src/components/ThemesPanel.tsx`: rename each theme, take cards out (×), accept or reject it. Accepted
themes become labelled group frames: the cards are gathered into a band below the board, one column per
card type. The theme's one-line description shows as the frame label's tooltip. Afterwards, right-click a
card → **Remove from "…"** takes it out of its frame (`removeFromGroup`); the frame refits, or disappears
when empty. Frames can still be renamed or removed (×) as before.

**Dragging cards into frames** works for any group frame, theme or not (`moveCardsIntoGroup`, wired up
in `BoardCanvas` with `onNodeDrag`/`onNodeDragStop`). While dragging, the frame under the mouse pointer
(or under the card's centre) is highlighted; on drop the card(s) join it, stacked under its last card.
A card dragged from one frame to another leaves the first. Frames whose cards form one column (like
themes) close the gap a card leaves (`tidyFrame`); freely arranged frames are only refitted. When a frame
grows, frames below it are pushed down so frames never overlap (`separateFrames`). Any card type is
accepted: the AI keeps themes to one type, but manual changes are the designer's call.

`src/ai/themes.ts` builds the request with short internal card references (c1, c2…, never shown to the
designer) and checks the answer: unknown references, cards of the wrong type, duplicates and one-card
themes are dropped. Mock mode batches same-type cards in board order. Reviews in progress are kept for
the visit only (not saved).

Note: the Lite models find fewer themes than full Flash, and results vary between runs; run it again
or use a bigger model from the picker if it misses obvious ones.

## Summary notes

**✦ Summarise** (under the AI Assistant's messages) writes a summary and puts it on the board as a
**yellow note**, not in the chat. With cards selected it summarises those ("✦ Summarise 3 selected")
and the note goes to their right; with nothing selected it summarises the whole board and the note
goes to its left. Typing "summarise these", "give me a summary of the board", "recap" or "tl;dr" does
the same (`isSummaryRequest` in `ChatPanel.tsx`); the chat only says the note was added, with **Show on
board**.

A note shows a title (editable), the date and time, what it covers ("3 selected cards" / "the whole
board (8 cards)", plus how many have since been removed), the summary, and the model. **Clicking it**
highlights the cards it summarises (everything else dims) and moves the view to them; clicking again,
clicking empty canvas or Esc clears it. × deletes it (click twice to confirm).

Notes are a separate node type (`note`, `src/board/NoteNode.tsx`), saved and exported with the board.
They are not cards: they aren't sent to the AI as part of the board, can't be linked or themed, and
don't count as cards. The instructions are `SUMMARY_SYSTEM_PROMPT` (summarise only what the cards and
links say, point out contradictions or unsupported claims, add nothing new); `src/ai/summary.ts` sends
only the chosen cards and the links between them.

**Changing a card's type.** In the review list, each proposal's **Type** dropdown changes it before
accepting; the row then shows "AI suggested Evidence · undo". On the board, click a card's type badge
(e.g. "EVID ▾") or the type in its full view to pick another type (`src/board/CardTypeSelect.tsx`, an
invisible native dropdown over the badge). Cards from documents keep the AI's original type
(`source.aiType`); when it differs, the full view says "AI suggested: … · changed by the designer" and
the chat assistant is told too. That record is evidence of the designer checking the AI.

The source list (oldest first) shows each document's AI summary and how many cards were accepted or
rejected, and the chat assistant gets the same list, so it can say where claims come from.

Storage: the source list, summaries and pending proposals are saved with the board (and included in
Export). The **files themselves are kept in this browser's IndexedDB** (`corkline-files`), because
localStorage is far too small for documents. Export/Import JSON does not carry the files; Duplicate
copies them and Delete removes them.

Mock mode returns fake proposals (the document's first few sentences, typed in rotation) so the flow
can be tried without an API key.

- `src/components/SourcesPanel.tsx` (+ `.css`): the panel (list, paste form, review list).
- `src/ai/extract.ts`: builds the request, parses the JSON, checks quotes (`quoteAppearsIn`), mock mode.
- `src/ai/prompts.ts`: `EXTRACT_SYSTEM_PROMPT` and the per-kind guidance (`EXTRACT_KIND_GUIDANCE`).
- `src/lib/documents.ts`: file types, size limits, text extraction, base64.
- `src/lib/fileStore.ts`: the IndexedDB file store.
- `server/aiProxy.ts`: accepts `files` (base64) on a turn and an optional `responseSchema`.

See
`../HANDOVER.md` at the repo root for the fuller project context (course, rubric, what's still open).
