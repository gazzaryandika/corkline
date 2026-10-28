// Parts of the rough cut that aren't recorded shots: the title slide, a 4 s cut of clip 2b, and placeholders.
// Run from video/: node assembly/build-parts.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const FPS = 30;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultTimeout(120000);

async function renderScene(url, frames, timeAt, out) {
  const dir = `frames/${path.basename(out, '.mp4')}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.render(t), timeAt(f / FPS));
    await page.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}.png` });
  }
  execFileSync(ffmpeg, ['-y', '-framerate', String(FPS), '-i', `${dir}/%04d.png`, '-c:v', 'libx264', '-preset', 'slow',
    '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out], { stdio: 'ignore' });
  console.log('wrote', out, frames, 'frames');
}
const file = (p) => 'file://' + path.resolve(p);

// title slide, 6.5 s
await renderScene(file('scenes/title.html'), Math.round(6.5 * FPS), (t) => t, 'assembly/00-title.mp4');

// clip 2b in 5.5 s instead of 7: the same scene time 18–25 s, sped up most where nothing needs reading
const MAP = [[0, 18], [0.8, 19.3], [3.1, 22.7], [5.5, 25.0]]; // [output s, scene s]
const remap = (t) => {
  for (let i = 0; i < MAP.length - 1; i++) {
    const [a0, b0] = MAP[i], [a1, b1] = MAP[i + 1];
    if (t <= a1) return b0 + (b1 - b0) * (t - a0) / (a1 - a0);
  }
  return MAP[MAP.length - 1][1];
};
await renderScene(file('scenes/problem.html'), 5.5 * FPS, (t) => Math.min(remap(t), 25 - 0.5 / FPS), 'assembly/02b-distill-short.mp4');

// placeholders
const ph = (k, h) => file('scenes/placeholder.html') + `?k=${encodeURIComponent(k)}&h=${encodeURIComponent(h)}`;
async function still(url, seconds, out) {
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  const png = out.replace('.mp4', '.png');
  await page.screenshot({ path: png });
  execFileSync(ffmpeg, ['-y', '-loop', '1', '-framerate', String(FPS), '-i', png, '-t', String(seconds), '-c:v', 'libx264',
    '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out], { stdio: 'ignore' });
  console.log('wrote', out);
}
await still(ph('DEMO · SHOT 9', 'Find connections'), 20, 'assembly/d09-placeholder.mp4');
await still(ph('REFLECTION', 'What we learned'), 30, 'assembly/r-placeholder.mp4');
await browser.close();
