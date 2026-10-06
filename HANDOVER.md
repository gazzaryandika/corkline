# Corkline — Handover

Last updated: 2026-10-06 (Sources: documents → draft cards; branch `feature/document-upload`)

## Themes: AI-suggested groups (2026-10-06, Ayan; branch `feature/ai-themes`, built on `feature/link-sources`)

**Done: the AI can propose themes among the cards on the board, which the designer reviews.** ✦ Find
themes in the AI Assistant → "Found N themes" → Review themes → accepted themes become labelled group
frames. Details in `app/README.md` → "Themes".

Decisions (with Ayan):
- **Theme frames**, i.e. the existing group frames: cards in a theme are gathered together (affinity
  mapping), in a band below the board, one column per card type.
- **Themes within one card type** (Evidence themes, Assumption themes, …), all types considered.
- **One theme per card**, the strongest fit. The designer can take a card out: in the review (×) or later
  on the board (right-click → Remove from "…", new).
- Only ungrouped cards are considered, so the designer's own groups are never changed, unless the
  designer **selects cards first**: then only the selection is considered (grouped or not). Typing
  "are there any themes in these?" in the chat runs the same thing. If there's no shared thread the AI
  says "No themes" with a one-sentence reason, which is a valid answer, not a failure (tested: 3
  unrelated Evidence cards → "No themes … they do not share a common thread").
- This is grouping what's already on the board, which matches the AI's "structure and flag, don't
  invent" role; the prompt says so explicitly (`THEMES_SYSTEM_PROMPT`).
- **Dragging a card onto a frame adds it** (any frame, any card type; the target frame highlights while
  dragging). Cards stack neatly in one-column frames, gaps close when a card leaves, and a growing frame
  pushes the frames below it down so they never overlap. Tested with real mouse drags: loose card →
  theme, theme → other theme, right-click remove.

Tested 2026-10-06 with 13 test cards: the review (rename, remove a card, accept/reject), frames on the
board, Remove from theme, and a second run skipping themed cards. Gemini 3.5 Flash-Lite found 1–3 themes
depending on the run (it's less thorough than full Flash, whose free quota is only 20 requests a day).

## Links as sources (2026-10-06, Ayan; branch `feature/link-sources`, built on `feature/document-upload`)

**Done: links can be read as sources, from the AI Assistant or the Sources panel.** Paste a link in the
chat and it offers "Read as source"; Corkline fetches it, drafts cards, and the chat shows "N cards ready
to review" with a button into the usual review list. Details in `app/README.md` → "Links".

Decisions:
- Web pages are fetched by the dev server and turned into readable text in the browser (Mozilla
  Readability), then stored as a text source, so quotes can be checked (✓/⚠) like any text document.
  We keep our own copy of what was read, so later changes to the page don't change the evidence.
- PDF/image links are downloaded like uploads. YouTube links go straight to Gemini (public videos).
- Pages behind a login (Brightspace, private Google Docs, Miro, Notion) can't be read; the message says
  to download or copy instead. JavaScript-built pages may come back empty and are refused rather than
  guessed at.
- The server only fetches public addresses (never this computer or the local network, checked at
  every redirect), with a size and time limit.
- Adding and reading sources moved out of the Sources panel into `useSourceActions` so the chat can use
  it and reads continue while the panel is closed.
- Fixed while testing: quick successive Accept clicks in the review list could overwrite each other.

Tested 2026-10-06: the address safety checks (10 cases refused), a Wikipedia article (clean text, 6
sensible Gemini cards, all quotes verified, cards link back), a PDF link, a 404, a YouTube video (renamed
to its title, quote from what was said), chat link-only message (no chat call) and link + question.

**Base branch:** this branch was started from `feature/document-upload` because it needs that work. Merge
pull request #1 first, then this one (its pull request can then target `main`).

## Sources: documents → draft cards (2026-10-06, Ayan)

**Done: designers can add the documents behind a project and the AI drafts cards from them for review.**
This is the "raw notes/transcript → draft cards" feature listed below, and it is the main human-direction
and checking story for the rubric's "AI contribution" and "AI integration" criteria. Full details in
`app/README.md` → "Sources".

How it works: Toolbar → **▤ Sources** (or **Add a document** on an empty board) → add files or paste
text → **Read with AI** → review list → accepted cards land on the board, each remembering its source.

Decisions made (with Ayan):
- **Review list, not one-at-a-time questions.** All proposals for a document are shown together; each
  can be retyped, edited, accepted or rejected, or Accept all / Reject all. Undecided ones are discarded
  when the review is finished. Unfinished reviews are saved with the board.
- **Cards only for now.** The AI does not propose relationships (links) yet; that's the obvious next step.
  It also doesn't fill in the Project brief.
- **File types: PDF, Word (.docx), text/Markdown/CSV, pasted text, images and audio**, up to 14 MB each
  (one request to Gemini is capped at 20 MB). Old .doc files are refused with a message to save as .docx.
- **Upload first, local folder access next.** "Connect a folder" (File System Access API, Chrome/Edge
  only) is the planned follow-up feature: Corkline would remember a folder and offer to read new or
  changed files when the project opens.
- **Every proposal carries the verbatim quote it rests on**, and for text/Word documents Corkline checks
  the quote is really in the document (⚠ if not). This is the "designer can inspect and check the AI"
  evidence. PDF/image/audio quotes can't be checked automatically and say so.
- **Document kind steers the AI** (context brief → Problems and Assumptions; interview → Evidence from
  what participants said, not the interviewer; etc.). Prompt text: `EXTRACT_SYSTEM_PROMPT` and
  `EXTRACT_KIND_GUIDANCE` in `app/src/ai/prompts.ts`. Quote these in the write-up.
- **Accepted cards go in a new band below the board**, one fixed column per card type, so the board
  reads top to bottom in the order documents were added ("how the project evolved").
- **Files are stored in the browser's IndexedDB**, not localStorage (far too small). Export/Import JSON
  carries the source list but not the files; Duplicate copies them; Delete removes them.
- The chat assistant now also receives the list of sources (with the AI's summary of each) and which
  document each card came from, so it can answer "where does this claim come from?"
- The AI proxy now retries automatically on Google's frequent 503 "high demand" answers (2 retries).

Tested in the browser (2026-10-06): new project → empty-board prompt → upload a Markdown brief → Mock
read → review → cards on board; Gemini read of the brief (7 sensible cards, all quotes verified, skipped a
point already on the board); a PDF interview transcript (3 Evidence cards from the participant's lines);
a PNG photo of sticky notes (read correctly); a .docx (text extracted); pasted text; reload keeps a
half-finished review; Duplicate copies files, Delete removes them; export/import validation; chat answer
cites the sources. **Not tested with a real audio recording** (no sample file was available), so audio
is supported by Gemini but unverified here.

Also added on this branch: **changing a card's type**, both in the review list (before accepting) and
on the board (click the card's type badge, or the type in its full view). When a card from a document
ends up with a different type than the AI proposed, that's recorded and shown ("AI suggested: Evidence
· changed by the designer"), which is useful evidence of human checking for the write-up.

Also added on this branch: a **Gemini model picker** next to Mock / Gemini (chat and Sources panel).
It lists the chat models the API key can use (fetched from Google), remembers the choice per browser,
and greys out models Google refuses for the key. Added because the free tier ran out of quota on the
full Flash models during testing; Lite models have much higher free limits. See `app/README.md`.

Known limits / next steps:
- Gemini's newer Flash models (3.5–3.8) were often overloaded or out of free quota on 2026-10-06; Ayan's
  local `.env.local` default is now `gemini-3.5-flash-lite`. The app's built-in default,
  `gemini-2.5-flash`, is **not available to new Google accounts** (404), so it should change; see
  `app/vite.config.ts`. (The model picker works around it, but a new teammate's first message would fail.)
- Next: AI-proposed relationships between new and existing cards (e.g. new Evidence *Supports* an
  Insight), then folder access.
- Privacy: in Gemini mode the panel warns that documents go to Google and may be used to improve its
  products on the free tier. Anonymise real participant material first.

## AI integration progress (2026-10-06)

**Done: the app now makes a real generative-AI call.** That closes the "no model wired in" gap flagged
further down this document.

Decisions made:
- **Provider: Google Gemini API (free tier)**, model `gemini-2.5-flash` (changeable via `GEMINI_MODEL`).
  We chose it over Ollama/local because the user picked Google; Anthropic has no free tier.
- **Approach: a thin working slice first, then the feature screens.** We proved one real call end to end
  through the existing chat panel before designing the bigger features, so the UI gets built around what
  the model can actually do.
- **The AI's role is still "inspect the reasoning, don't invent ideas".** This is written into the
  system prompt.

What was built (see `app/README.md` → "AI (Google Gemini)" for file details):
- `app/server/aiProxy.ts`: a small server-side proxy inside the Vite dev server (`/api/ai/chat`,
  `/api/ai/status`). It holds the API key, so the browser never sees it.
- `app/.env.local` holds `GEMINI_API_KEY` (git-ignored; template in `app/.env.example`). It's read only
  at server start, so restart `npm run dev` after changing it.
- `app/src/ai/client.ts`: `askAi(mode, request)`, the single entry point for every AI feature. It has
  two modes: **Mock** (free, canned replies) and **Gemini** (real call).
- `app/src/ai/boardContext.ts`: turns the board into text for the model. It lists each card's
  type, title, body, group, SELECTED and GAP flags, plus all relationships.
- `app/src/ai/prompts.ts`: the system prompt, i.e. the AI's role and rules, including "no Markdown".
  Quote this in the write-up.
- Cards are referred to by type + title (e.g. Insight "Physical money is understood…"), never internal codes, so
  users can find them on the canvas. Duplicate names get (2), (3).
- `app/src/ai/plainText.ts`: a safety net that strips any Markdown the model still produces.
- Chat panel (`app/src/components/ChatPanel.tsx`):
  - Mock/Gemini switch.
  - Each answer is tagged with the model that wrote it.
  - The last 12 turns are sent as history, and the current board is attached to the newest question.
  - Failed calls show as a red message with a Retry button, never faked, as the brief requires.

Verified:
- Build, type-check and lint all pass.
- Mock mode works.
- The no-key error shows correctly.
- A real Gemini answer about the example board cited the right cards and judged
  evidence strength sensibly.

**Security note:** one API key was pasted into the chat on 2026-10-06. The user was told to delete it in
Google AI Studio and use a fresh key. Never paste keys into chat; put them only in `app/.env.local`.

What the AI can and can't do right now: it **reads** the whole board and answers in chat. It **cannot**
add, edit or delete cards or connections.

Open decisions / next steps:
1. ~~Project brief~~ **Done.** The **✎ Project** button in the toolbar opens a panel with two tabs:
   - **Overview**: project name and description.
   - **Context**: intended users, client/setting, current stage, and anything else the AI should know.

   It saves with the board (and in Export/Import JSON), and the project name shows in the toolbar. It is
   sent to the AI as a PROJECT BRIEF section before the board on every question. Verified: the AI
   answered correctly from the brief. Files: `app/src/components/ProjectBriefModal.tsx`,
   `ProjectBrief` in `app/src/types.ts`, and `describeBrief()` in `app/src/ai/boardContext.ts`.
   The example board ships with a pre-filled Triodos Kids brief (`SEED_BRIEF` in `app/src/data/seed.ts`),
   summarised from the board's own cards; the user should check it for accuracy.
1b. **Projects page — done (2026-10-06).** The app now opens on a Projects page (`#/`); each board is a
   project (`#/project/<id>`).
   - Actions: New project (blank, opens the Project panel to name it), From example (Triodos board),
     Import (JSON → new project), Duplicate, Export, and Delete (with a click-again confirm).
   - The board toolbar has a **← Projects** button.
   - Storage is **this browser only** (the user's choice): the project list is under
     `corkline-projects-v1`, and each board under `corkline-project:<id>`.
   - On first run, the old single board (`corkline-board-v2`) was copied into the first project and left
     in place as a backup.
   - Fixed while building this: edits made in the half-second before leaving a board were lost. Pending
     saves are now written on leave/tab close, and Reset/Import saves immediately.
   - Files: `app/src/pages/ProjectsPage.tsx`, `app/src/lib/route.ts`, `app/src/BoardScreen.tsx`, and the
     project functions in `app/src/lib/storage.ts`.
   - A shared online database (team access) was considered and deferred.
2. **Should the AI change the board?** Partly decided (2026-10-06, Ayan): the AI may **propose cards
   drafted from the designer's own documents**, which the designer accepts, edits or rejects; nothing
   reaches the board without approval. See "Sources" below. **Gazza should confirm** this reading of
   the "AI doesn't invent ideas" rule before the pull request is merged. Proposing *links* between cards
   is still open (deliberately left out of this first version).
3. Then the planned features, which reuse `askAi()`:
   - ~~raw notes/transcript → draft cards (strongest rubric fit)~~ **Done**, see "Sources" below.
   - AI reasoning check that highlights cards
   - a board summary
4. Check that the Google project is on the **free tier** (no billing) so there's no surprise cost. Free
   tier: rate limits apply, and Google may use prompts to improve its products, so think before sending
   real participant transcripts.

## Status as of this update

The tool has been rebuilt as a real app: **`app/`** is now a React + TypeScript + Vite project (canvas
built on [React Flow](https://reactflow.dev)) and is where active development happens from here on.
`corkline.html` at this same folder level is kept only as a **historical reference** — it is the last
version of the original single-file prototype and is no longer edited. See `app/README.md` for how to run
the new app and exactly what changed and why (every bug found in a review of the original file was fixed
as part of this rebuild, not patched onto the old code).

The rest of this document (below) describes the project's purpose, course context, and rubric, which
haven't changed. Sections describing the old single-file implementation specifically ("What's actually
built", "Bugs fixed") describe the *original* `corkline.html` and are kept for history — they are
superseded by `app/README.md` for the current implementation.

## What this is

Corkline is a node-based canvas for tracing a design process. You drop in typed cards — Problem, Evidence, Insight, Opportunity, Direction, Prototype, Assumption — and connect them with labeled arrows (Leads to / Supports / Tests / Contradicts). Any card that needs evidence behind it but has nothing feeding in gets flagged amber automatically.

The point is not AI generating design ideas. It's making the reasoning trail visible: where a claim actually comes from, where the gaps are, where two findings contradict each other. A structured "show your work" for a design process, so a team (or a tutor) can see the path from problem to evidence to decision, not just the final output.

Right now it's one self-contained HTML file — no build step, no dependencies, open it directly in a browser.

## Why this project exists

This is the group project for **IDEM307 Generative AI & Design** (TU Delft, Q1 2026-2027, Prof. Gerd Kortuem) — 50% of the course grade, team of 2-3. Corkline was built solo before the brief was even set, then adopted as the actual submission because its whole premise ("maintain traceable decisions") is one of the brief's own example activities.

Official rubric, four criteria:

| Criterion | Weight | Assessed on |
|---|---|---|
| Design opportunity and context | 25% | Clear activity, intended user, context; real evidence of current practice |
| AI contribution | 25% | Task-specific AI role; meaningful human direction and checking; why AI beats a simpler approach |
| AI integration and interaction | 30% | AI integral, not incidental; the designer can direct, inspect, revise, use its contribution; convincing demo |
| Demonstrated value and judgement | 20% | Realistic case; comparison with current practice; evidence for and against the claim; a real design change made |

Week 4 progress report (deadline TBC on Brightspace) needs five things visible: the design opportunity/user/context, the evidence behind it, the proposed tool and AI's role, what's built so far, and the current direction + main uncertainty + next priority. Final is a live demo + showcase video + written docs, and a failed model call has to be shown honestly on screen, never faked.

**(Resolved 2026-10-06, see top.) The biggest gap against the brief used to be that there was no generative AI model wired into the tool at all.** It's a static board. That's the main thing "making it into an actual application" needs to fix.

## Where this folder sits relative to the vault

The official, tracked copy lives in the Obsidian vault:
```
Brain 2.0 School/10 School/2026-2027/Q1/IDEM307 Generative AI & Design/Group Project - Corkline/Corkline Prototype/corkline.html
```
with a tracker note (`Group Project - Corkline.md`) that carries the live checklist, the rubric, and the two citable course papers.

`corkline.html` in *this* folder is a duplicate, copied out on 2026-09-18 to become the real working codebase — this is meant to be where active development happens now, not the vault. **The vault copy does not update automatically.** When there's a version here worth having as the tracked deliverable, copy it back manually (or decide to reverse the relationship once this becomes a real app with a build step — vault can't hold `node_modules`).

## What's actually built

- 7 typed node types, each color-coded, with editable title + body text.
- 4 edge kinds (Leads to / Supports / Tests / Contradicts), rendered as animated directional lines with the relationship name as a label right on the line. Contradicts uses a pulsing line with diamond markers instead of an arrow — tension, not flow.
- Connecting two nodes: click the dot on a card's edge (arms it, highlights the source, shows a hint bar), then click any other card to finish. Dragging the dot straight onto a target also works. This two-path design exists because a precise drag-and-release is unreliable on a trackpad — see "Bugs fixed" below for why it took several passes.
- Gap detection: Insight/Opportunity/Direction/Prototype nodes need at least one incoming edge, or they get an amber pulsing ring and a "no evidence trail yet" tag. This is the actual pitch of the tool made visible, not decoration.
- Pan/zoom canvas, a legend panel, delete with a two-step confirm (click once to arm, again to confirm — no modal).
- Autosaves to `localStorage` so a reload doesn't lose the board.
- Seeded with a small fake hospital-waiting-room example so it's not a blank canvas on first open.

## What's not built

- ~~No AI model call anywhere.~~ Done 2026-10-06; see "AI integration progress" at the top.
- No way to ingest real material (interview transcripts, safari photos) into the board — everything is typed in by hand right now.
- Photo upload existed at one point and was **removed entirely**, not fixed — see below. If photo support comes back, it needs real error handling, not another `<img>` with no fallback.
- No multi-user / collaboration — single browser, single `localStorage`, no backend.

## A parallel experiment worth knowing about

A separate Claude Code session, working solo through the earlier course exercises, built a second variant to specifically plug the "no AI" gap:

```
Brain 2.0 School/10 School/2026-2027/Q1/IDEM307 Generative AI & Design/Claude Solo Attempt (experiment, not for submission)/3 - Corkline Prototype/corkline-with-ai-suggest.html
```

It adds a ✦ button per node that proposes a plausible *next* node (right type, pre-linked, built from that node's actual text and neighbours, not from nothing), editable before you Accept or Discard. Has a mock mode (free, templated, no API call) and a live mode (real Anthropic API call, opt-in, needs your own key pasted in — never turned on or paid for by that session). Its own README flags that browser-side API keys are fine for a local prototype but wrong for anything shared, and that the real fix is a small server-side proxy holding the key.

**This conflicts with a design decision already made for the main tool**, worth stating plainly: earlier in this project, the explicit call was that *AI should not suggest new nodes* — its job is to structure and flag what's already there, not generate design ideas. The AI-suggest variant does the opposite. It's not automatically the wrong direction (it does solve the rubric's biggest gap directly, and cleanly), but treat it as a proposal to evaluate against that earlier decision, not as work already agreed and merged in.

Live candidates for a AI role that don't cross that line: gap-detection running an actual model over the whole board instead of the simple "has an incoming edge" rule now, summarizing a board into a narrative, classifying pasted-in raw text into typed nodes automatically (this is probably the strongest fit for the rubric's "prepares input and context" language, and for the actual course case: it means real interview/observation material could be ingested instead of hand-typed).

## Bugs fixed, and why they matter for future work

The connect/edge-popup UI went through several real bugs worth not repeating:

1. **Photo upload + a full-screen "enlarge" viewer** for node images. iPhone/Mac photos are often HEIC, which most browsers can't render in an `<img>`, so the viewer got stuck showing a broken image on a dark overlay with no way to close it. Rather than keep patching it, the whole feature was removed.
2. **The relationship-picker popup wouldn't close after picking one.** Root cause: its CSS set `display:flex` directly on the element's ID selector, which has higher specificity than the browser's built-in `[hidden] { display:none }` rule — so toggling the `hidden` attribute in JS had no visual effect once that CSS was in place.
3. **After a partial fix, the "drag preview" guide line stopped showing at all.** The `hidden` attribute/property was behaving inconsistently in whatever browser context it was being tested in.

The actual fix that stuck: **stopped relying on the native `hidden` attribute entirely.** Visibility for the temp line, the connect hint, and the edge popup is now controlled by a single `.is-hidden { display:none !important; }` class, added/removed directly. If you extend this file, keep using that pattern for anything that shows/hides — don't reintroduce `.hidden = true/false`.

## Open decisions (not mine to make)

- Team: per the vault tracker, the 2-3 person group isn't confirmed yet, and buy-in on Corkline as the shared direction isn't either.
- What "make it into an actual application" means concretely — options run from "still a single HTML file, just with a real API call and input handling" up to "Vite + a framework + a small backend proxy for the API key." No scaffolding has been done yet; this file is plain HTML/CSS/JS, no `package.json`.
- Whether to adopt the AI-suggest variant's approach, build gap-detection with a real model instead, do both, or something else — see above.
- Whether/how to keep this folder and the vault copy in sync once real development starts here.

## Quick facts for whoever picks this up

- **GitHub (private):** https://github.com/gazzaryandika/corkline. Owner is gazzaryandika; collaborator
  ayan2509 (write access, invited 2026-10-06). Team workflow (branches, pull requests, tags, rollback) is
  in `CLAUDE.md`. Tag `v0.4-projects` marks the state with the projects page, project brief and Gemini chat.

- **Current app**: `cd app && npm install && npm run dev`, then open the localhost URL Vite prints. See `app/README.md`.
- **Historical reference only**: `corkline.html` at this folder's root, the original no-build-step single-file version. Still opens directly in a browser but is no longer where development happens.
- State is seeded example data on first load, then whatever's in `localStorage` after that (new app uses key `corkline-board-v1`, a different key than the old file's `corkline-state`, so the two don't collide if both are ever open at once).
- The new app also has explicit Export/Import JSON buttons in the toolbar — use Export to keep an actual backup, since `localStorage` alone was the original's single point of failure.
- The Gemini API key lives only in `app/.env.local` (git-ignored) and is used server-side by `app/server/aiProxy.ts`. Never commit it, and never put a key in browser code.
- Git history and GitHub: see the first bullet in this section.
