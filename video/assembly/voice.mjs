// AI voiceover for the rough cut: one Gemini text-to-speech take per section, placed at the section's start,
// mixed onto assembly/corkline-rough-cut.mp4 → assembly/corkline-with-voice.mp4.
// Run from video/: node assembly/voice.mjs   (uses GEMINI_API_KEY from app/.env.local; the key is never printed)
// Takes are cached in assembly/voice/; delete one (or change its text) to regenerate it.
// PARTIAL=1 mixes whatever takes exist and skips lines that can't be generated (e.g. the daily quota ran out).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const MODEL = 'gemini-2.5-flash-preview-tts';
const VOICE = 'Charon'; // calm, informative
const STYLE = 'Read this as the calm, warm narrator of a short product demo video, at an unhurried pace:';
const LEAD = 0.35; // seconds of picture before each line starts

// [section name as in timings.json, offset into that section (s), line]
const LINES = [
  ['Intro 1 · scattered', 0.4, 'Have you ever had this problem? Interviews, sticky notes, PDFs, photos, spreadsheets. Your design material ends up scattered everywhere.'],
  ['Intro 2 · only in your head', 0, 'The organisation lives only in your head, and the connections between it all are hard to see.'],
  ['Intro 2b · distill (5.5 s cut)', 0, 'Distilling all that research, and finding what connects, is the hard part.'],
  ['Intro 2c · introducing Corkline', 0, 'Introducing Corkline.'],
  ['Intro 3 · pulling it together', 0, 'A reasoning board for design projects. It puts everything on one board, and makes your reasoning visible.'],
  ['Demo 1 · new project', 0, 'Start a project: give it a name, and describe the challenge in a sentence.'],
  ['Demo 2 · add the brief (Mock)', 0, 'Then add your documents. Here, the project brief. Corkline’s AI reads it and drafts cards.'],
  ['Demo 3 · review cards (Mock)', 0, 'Nothing reaches the board until you accept it. Each draft keeps the quote it came from. This one only lists methods, so we reject it.'],
  ['Demo 4 · link by hand', 0, 'Drag from card to card to link them.'],
  ['Demo 5 · add an Assumption', 0, 'You can add your own cards too. This assumption is ours: kids learn about money by doing, not by being told. The board flags that it still needs a problem behind it, so we link one.'],
  ['Demo 6 · interview (Mock)', 0, 'Next, an interview transcript, here a sample one. Corkline looks for evidence: what people actually said. We accept the quotes, and link them to our assumption. The warnings clear as the chain fills in. The cards we haven’t linked keep their flag, so nothing slips through.'],
  ['Demo 7 · the board grows', 0, 'A few weeks in, a board might look like this: reasoning traced from problem to prototype, so every idea leads back to its evidence.'],
  ['Demo 8 · AI Assistant', 0, 'The AI Assistant is a second pair of eyes on your reasoning. It answers, checks and suggests, but it never invents ideas. You decide.'],
  ['Demo 9 · Find connections (Mock)', 0, 'Find connections looks for missing links, starting with the gaps. Every suggestion comes with a reason. You accept or reject it, and the gaps close.'],
  // the reflection is one 35 s scene cut into four clips; offsets are from the start of the clip named
  ['Reflection 1 · goal, what worked', 0.6, 'We set out to make design reasoning visible. Does Corkline do that? Mostly, yes.'],
  ['Reflection 1 · goal, what worked', 7.95, 'The AI’s role is small and easy to check, and it caught twelve skipped steps on our own board.'],
  ['Reflection 2 · limits, AI growth', 4.6, 'But we only tested it on two projects, by ourselves, and real projects loop back.'],
  ['Reflection 3 · garbage in, garbage out', 1.4, 'AI has grown immensely, even in the last few months. But garbage in, garbage out still stands.'],
  ['Reflection 4 · closing', 0.1, 'Our most useful decisions were about what the AI should not do.'],
];

const env = fs.readFileSync('../app/.env.local', 'utf8');
const KEY = /^GEMINI_API_KEY=(.+)$/m.exec(env)?.[1].trim();
if (!KEY) throw new Error('No GEMINI_API_KEY in app/.env.local');

const timings = JSON.parse(fs.readFileSync('assembly/timings.json', 'utf8'));
const sectionStart = (name) => {
  const s = timings.find((r) => r.name === name);
  if (!s) throw new Error(`No section "${name}" in timings.json`);
  return s;
};
const dur = (f) => {
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(spawnSync(ffmpeg, ['-i', f]).stderr.toString());
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
};

let quotaGone = false;
async function tts(text) {
  const body = {
    contents: [{ parts: [{ text: `${STYLE} ${text}` }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    if (process.env.PARTIAL && quotaGone) throw new Error('quota used up');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && process.env.PARTIAL && attempt >= 1) { quotaGone = true; throw new Error('quota used up'); }
    if (res.status === 429 || res.status >= 500) {
      const wait = 20 * (attempt + 1);
      console.log(`  ${res.status}, retrying in ${wait} s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const json = await res.json();
    if (!res.ok) throw new Error(`TTS failed (${res.status}): ${json.error?.message ?? 'unknown error'}`);
    const data = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error('TTS returned no audio');
    return Buffer.from(data, 'base64'); // 16-bit PCM, 24 kHz, mono
  }
  throw new Error('TTS kept failing (rate limit?)');
}

fs.mkdirSync('assembly/voice', { recursive: true });
const takes = [];
for (const [i, [section, offset, text]] of LINES.entries()) {
  const hash = crypto.createHash('sha1').update(`${MODEL}|${VOICE}|${STYLE}|${text}`).digest('hex').slice(0, 10);
  const wav = `assembly/voice/${String(i).padStart(2, '0')}-${hash}.wav`;
  if (!fs.existsSync(wav)) {
    console.log(`voice ${i + 1}/${LINES.length}: ${text.slice(0, 50)}…`);
    let pcm;
    try { pcm = await tts(text); } catch (e) {
      if (!process.env.PARTIAL) throw e;
      console.log(`  skipped: ${e.message}`);
      continue;
    }
    const raw = wav.replace('.wav', '.pcm');
    fs.writeFileSync(raw, pcm);
    // trim leading/trailing silence so placement is exact
    execFileSync(ffmpeg, ['-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', raw,
      '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',
      wav], { stdio: 'ignore' });
    fs.rmSync(raw);
  }
  const s = sectionStart(section);
  takes.push({ wav, text, at: s.start + offset + LEAD, len: dur(wav), section });
}

// place each take; if one would run into the next, nudge the next one later and report it
let prevEnd = 0;
console.log('\n  start    len   ends  line');
for (const [i, t] of takes.entries()) {
  t.at = Math.max(t.at, prevEnd + 0.25);
  prevEnd = t.at + t.len;
  const next = takes[i + 1];
  const room = next ? next.at - t.at : null;
  const flag = room !== null && t.len > room - 0.2 ? '  ⚠ runs into the next line' : '';
  console.log(`${t.at.toFixed(1).padStart(7)} ${t.len.toFixed(1).padStart(6)} ${prevEnd.toFixed(1).padStart(6)}  ${t.text.slice(0, 60)}${flag}`);
}

// mix: every take delayed to its time, normalised for speech
const total = timings.reduce((a, r) => a + r.dur, 0);
const inputs = takes.flatMap((t) => ['-i', t.wav]);
const delays = takes.map((t, i) => `[${i}:a]aresample=48000,adelay=${Math.round(t.at * 1000)}:all=1[a${i}]`).join(';');
const mix = `${delays};${takes.map((_, i) => `[a${i}]`).join('')}amix=inputs=${takes.length}:normalize=0,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[voice]`;
execFileSync(ffmpeg, ['-y', ...inputs, '-filter_complex', mix, '-map', '[voice]', '-c:a', 'pcm_s16le', 'assembly/voiceover.wav'], { stdio: 'ignore' });
execFileSync(ffmpeg, ['-y', '-i', 'assembly/corkline-rough-cut.mp4', '-i', 'assembly/voiceover.wav', '-map', '0:v', '-map', '1:a',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'assembly/corkline-with-voice.mp4'], { stdio: 'ignore' });
console.log('\nwrote assembly/voiceover.wav and assembly/corkline-with-voice.mp4');
