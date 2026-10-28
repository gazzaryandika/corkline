// Renders an animated HTML scene (exposing window.render(t)) to MP4, frame by frame.
// Usage: node scene.mjs <scene.html> <seconds> <out.mp4> [--from s] [--stills t1,t2,...]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const [html, seconds, out, ...rest] = process.argv.slice(2);
// --from <s>: start at this point of the scene's timeline (scenes share one timeline across clips)
const from = rest.includes('--from') ? Number(rest[rest.indexOf('--from') + 1]) : 0;
const flag = rest.includes('--stills') ? '--stills' : null;
// --frames-only: keep the PNG frames in <out> (a folder) instead of encoding an MP4
const framesOnly = rest.includes('--frames-only');
const stillList = flag ? rest[rest.indexOf('--stills') + 1] : '';
const FPS = 30;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + path.resolve(html));
await page.evaluate(() => document.fonts.ready);

if (flag === '--stills') {
  for (const t of stillList.split(',')) {
    await page.evaluate((t) => window.render(t), from + Number(t));
    await page.screenshot({ path: `still-${t}.png` });
  }
} else {
  const dir = framesOnly ? out : 'scene-frames';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  const total = Math.round(Number(seconds) * FPS);
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.render(t), from + f / FPS);
    await page.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}.png` });
  }
  if (!framesOnly) execFileSync(ffmpeg, ['-y', '-framerate', String(FPS), '-i', `${dir}/%04d.png`, '-c:v', 'libx264', '-preset', 'slow',
    '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'ignore' });
  console.log('wrote', out, total, 'frames');
}
await browser.close();
