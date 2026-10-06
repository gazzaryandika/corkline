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
- `src/ai/prompts.ts`: the system instructions defining the AI's role (inspect reasoning, don't invent ideas).

See
`../HANDOVER.md` at the repo root for the fuller project context (course, rubric, what's still open).
