# Corkline demo video

The course demo video (TU Delft IDEM307): **[`assembly/corkline-with-voice.mp4`](assembly/corkline-with-voice.mp4)**,
2:57, 1080p, with an AI voiceover. Everything here can rebuild it.

## What's where

| Folder | What |
|---|---|
| `assembly/corkline-with-voice.mp4` | **The final video.** |
| `assembly/VOICEOVER.md` | The voiceover script and the timeline (what starts when). |
| `clips/` | Every shot as its own MP4, in order: intro (`01`–`03`), demo (`d01`–`d09`). `-MOCK` = recorded with the AI in Mock mode. |
| `assembly/` | The title slide, the shortened intro clip 2b, the reflection (`r1`–`r4`), and the scripts that join it all and add the voice. |
| `assembly/voice/` | The generated voice takes (one per line), cached so re-running doesn't spend quota. |
| `scenes/` | Animated HTML scenes: the intro (`problem.html`), title, AI Assistant card, reflection. Each exposes `window.render(t)`. |
| `demo/` | Scripts that drive the real app with Playwright and film it: one per shot, plus `lib.mjs` (recorder, camera, cursor, render) and `stage.mjs` (sets the app up off camera exactly as the previous shot ended). |
| `assets/` | The rehearsal brief and sample interview dropped into the app, and `cursors/` the cursor art. |

Not in git (rebuilt by the scripts): `frames/` (intermediate PNGs, several GB), the silent rough cut, the WAV voice
track.

## Rebuilding

Run everything from this folder, with the app's dev server running (`npm run dev` in `app/`, port 5173):

```bash
npm install                                   # playwright, sharp, ffmpeg-static (first time: npx playwright install chromium)
node demo/d05-add-assumption.mjs              # re-film one shot → clips/
node scene.mjs scenes/problem.html 10 out.mp4 # render an animated scene (see the file for --from / --stills)
node assembly/build-parts.mjs                 # title slide, short 2b, placeholders
node assembly/assemble.mjs                    # join everything → rough cut + timings.json (prints the timeline)
node assembly/voice.mjs                       # voice (Gemini TTS, key from app/.env.local) → corkline-with-voice.mp4
```

- Each demo shot starts on the previous shot's last frame. Shots are filmed frame by frame, so waits are cut and
  zooms, cursor and click ripples are added afterwards (`render()` in `demo/lib.mjs`).
- `voice.mjs`: the lines are in the script. Gemini's free tier allows only a few voice requests a day; with
  `PARTIAL=1` it mixes what it has and skips the rest.

## Still open (as of 2026-10-28)

- Shots 2, 3, 6 and 9 show **Mock** AI output ("[Mock: no model was called]"). For a final version, re-film them
  with Gemini and the real Triodos brief and an anonymised interview excerpt (`assets/`).
- The interview in shot 6 is a rehearsal file, and the cards that appear in shot 7 are illustrative; the voiceover
  says so ("here a sample one", "a board might look like this").
