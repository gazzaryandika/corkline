# Corkline — instructions for Claude Code

Read `HANDOVER.md` first. It has the project's purpose, course rubric (TU Delft IDEM307), decisions made so
far, what's built, and the open next steps. `app/README.md` covers how the code is organised.

## Running the app

```bash
cd app && npm install && npm run dev
```

AI features need a Gemini key in `app/.env.local` (copy `app/.env.example`; free key from
https://aistudio.google.com/apikey). Each teammate uses their own key. Without one, use the chat's Mock mode.

## Team workflow

- Two people work on this repo, one feature at a time (not in parallel).
- Never commit straight to `main`. Make a branch per feature (e.g. `feature/notes-to-cards`), push it, and
  merge through a pull request on GitHub.
- Before starting: `git checkout main && git pull`, then branch from there.
- After a feature is merged and working, tag it (e.g. `v0.5-notes-to-cards`) so there's a named point to
  roll back to.
- Roll back with `git revert <commit>` (keeps history). Don't rewrite or force-push `main`.

## Rules

- **Never commit API keys.** `app/.env.local` is git-ignored; keep keys only there, never in code or chat.
- **Update `HANDOVER.md`** at the end of each feature (what was built, decisions, what's next), so the
  next person — or their Claude session — has the context.
- The AI's role in Corkline is to inspect and strengthen the designer's reasoning, not to invent design
  ideas (see `app/src/ai/prompts.ts` and HANDOVER.md). Check with the team before changing that.
- Run `npm run build` and `npm run lint` in `app/` before committing.
