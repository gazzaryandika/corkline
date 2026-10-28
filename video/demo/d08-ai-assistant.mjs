// Demo shot 8: open the AI Assistant and say what it is, with a title card beside it. Starts where shot 7 ends.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { openApp, recorder, centreOf, render, cameraFrom, encode1080 } from './lib.mjs';
import { afterShot7 } from './stage.mjs';

const DIR = 'frames/d08';
const SECONDS = 11.5, FPS = 30, N = Math.round(SECONDS * FPS);

const { browser, page } = await openApp();
const start = await afterShot7(page);

const head = await centreOf(page, page.locator('.chat-panel__head'));
const r = recorder(page, DIR);
await r.place(start.cursor.x, start.cursor.y);
await r.hold(12);
await r.moveTo(head.x + 40, head.y, 32, 40);
await r.hold(5);
const fOpen = r.index();
await r.click();
await page.waitForTimeout(400);
await start.setView(); // the board stays as shot 7 left it
const panel = await page.locator('.chat-panel').boundingBox();
await r.hold(6);
await r.moveTo(panel.x + panel.width * 0.72, panel.y + panel.height * 0.5, 20, 20); // rest in the empty message area
while (r.log.frames.length < N) { await start.setView(); await r.frame(); }
r.save();
await browser.close();

// frame the panel on the left half, leaving the right half for the title card
const k = 1.45;
const inside = (c) => ({ x: Math.min(Math.max(c.x, 889 / k), 1600 - 889 / k), y: Math.min(Math.max(c.y, 500 / k), 900 - 500 / k) });
const onPanel = inside({ x: panel.x - 30 + 889 / k * 0.98, y: panel.y + panel.height / 2 });
const camera = cameraFrom([
  [0, start.cam, start.zoom], // shot 7's last framing
  [12, start.cam, start.zoom],
  [fOpen + 4, { x: (head.x + 800) / 2, y: (head.y + 450) / 2 + 60 }, 1.2],
  [fOpen + 26, onPanel, k],
  [N - 1, { x: onPanel.x + 6, y: onPanel.y }, k * 1.02],
]);
const out = await render(DIR, camera, null, { encode: false });

// the title card, rendered as transparent frames and laid over the shot
const ob = await chromium.launch();
const op = await ob.newPage({ viewport: { width: 1920, height: 1080 } });
await op.goto('file://' + path.resolve('scenes/ai-callout.html'));
await op.evaluate(() => document.fonts.ready);
for (let f = 0; f < N; f++) {
  const file = `${out}/${String(f).padStart(4, '0')}.png`;
  await op.evaluate((t) => window.render(t), f / FPS);
  const card = await op.screenshot({ omitBackground: true });
  const merged = await sharp(file).composite([{ input: card }]).png({ compressionLevel: 1 }).toBuffer();
  fs.writeFileSync(file, merged);
}
await ob.close();
encode1080(out, 'clips/d08-ai-assistant.mp4');
