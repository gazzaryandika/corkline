// Joins every part of the video, in order, into one rough cut, and prints where each part starts.
// Run from video/: node assembly/assemble.mjs
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const PARTS = [
  ['Title slide', 'assembly/00-title.mp4'],
  ['Intro 1 · scattered', 'clips/01-scatter.mp4'],
  ['Intro 2 · only in your head', 'clips/02-only-in-your-head.mp4'],
  ['Intro 2b · distill (5.5 s cut)', 'assembly/02b-distill-short.mp4'],
  ['Intro 2c · introducing Corkline', 'clips/02c-introducing.mp4'],
  ['Intro 3 · pulling it together', 'clips/03-pulling-together.mp4'],
  ['Demo 1 · new project', 'clips/d01-new-project.mp4'],
  ['Demo 2 · add the brief (Mock)', 'clips/d02-add-brief-MOCK.mp4'],
  ['Demo 3 · review cards (Mock)', 'clips/d03-review-cards-MOCK.mp4'],
  ['Demo 4 · link by hand', 'clips/d04-link-cards-MOCK.mp4'],
  ['Demo 5 · add an Assumption', 'clips/d05-add-assumption.mp4'],
  ['Demo 6 · interview (Mock)', 'clips/d06-interview-MOCK.mp4'],
  ['Demo 7 · the board grows', 'clips/d07-growth.mp4'],
  ['Demo 8 · AI Assistant', 'clips/d08-ai-assistant.mp4'],
  ['Demo 9 · Find connections (Mock)', 'clips/d09-find-connections-MOCK.mp4'],
  ['Reflection 1 · goal, what worked', 'assembly/r1-reflection.mp4'],
  ['Reflection 2 · limits, AI growth', 'assembly/r2-reflection.mp4'],
  ['Reflection 3 · garbage in, garbage out', 'assembly/r3-reflection.mp4'],
  ['Reflection 4 · closing', 'assembly/r4-reflection.mp4'],
];

const frames = (f) => {
  const out = spawnSync(ffmpeg, ['-i', f, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-']).stderr.toString(); // ffmpeg reports on stderr
  return Number([...out.matchAll(/frame=\s*(\d+)/g)].pop()[1]);
};
const list = 'assembly/parts.txt';
fs.writeFileSync(list, PARTS.map(([, f]) => `file '${process.cwd()}/${f}'`).join('\n') + '\n');
let t = 0;
const rows = PARTS.map(([name, f]) => { const n = frames(f), row = { name, start: t, dur: n / 30 }; t += n / 30; return row; });
// re-encode, so parts made by different scripts join cleanly
execFileSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
  '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', 'assembly/corkline-rough-cut.mp4'], { stdio: 'ignore' });
const mmss = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
for (const r of rows) console.log(`${mmss(r.start).padStart(6)}  ${r.dur.toFixed(1).padStart(5)} s  ${r.name}`);
console.log(`total ${mmss(t)}`);
fs.writeFileSync('assembly/timings.json', JSON.stringify(rows, null, 2));
