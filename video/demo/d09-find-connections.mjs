// Demo shot 9 (Mock rehearsal): Find connections proposes links for the cards with gaps; accept them one by one,
// add them, and see the board and the gap count respond. Starts where shot 8 ends.
import { openApp, recorder, centreOf, render, cameraFrom } from './lib.mjs';
import { afterShot8 } from './stage.mjs';

const DIR = 'frames/d09';
const { browser, page } = await openApp();
const start = await afterShot8(page);
let holdView = true; // keep shot 7's whole-board view until the app moves the board itself
const frame = async (n = 1) => { for (let i = 0; i < n; i++) { if (holdView) await start.setView(); await r.frame(); } };

const btn = await centreOf(page, page.getByRole('button', { name: /Find connections/ }));
const gapsBefore = await page.locator('button[title^="Trace check"]').innerText();
const r = recorder(page, DIR);
await r.place(start.cursor.x, start.cursor.y);
await frame(14);

// 1. ask
await r.moveTo(btn.x, btn.y, 30, 14);
await frame(6);
const fAsk = r.index();
await r.click();
await frame(1);
r.repeat(24); // the short wait for the answer, held a little
await page.locator('.link-props').waitFor();
await page.waitForTimeout(300);
const list = await page.locator('.chat-links').last().boundingBox();
await frame(75); // time to read the proposals and their reasons

// 2. judge each one
const props = page.locator('.link-prop');
const n = await props.count();
const marks = [];
for (let i = 0; i < n; i++) {
  await props.nth(i).scrollIntoViewIfNeeded();
  const ok = await centreOf(page, props.nth(i).getByRole('button', { name: '✓ Accept' }));
  await r.moveTo(ok.x, ok.y, i ? 22 : 26, 10);
  await frame(4);
  marks.push(r.index());
  await r.click();
  await frame(20);
}
const add = await centreOf(page, page.getByRole('button', { name: /^Add \d links?$/ }));
await r.moveTo(add.x, add.y, 18, 10);
await frame(6);
const fAdd = r.index();
holdView = false; // from here the app frames the newly linked cards
await r.click();
const t0 = Date.now();
while (Date.now() - t0 < 900) { await r.frame(); r.repeat(1); }
await frame(40);

// 3. the gap count in the toolbar
const gaps = await centreOf(page, page.locator('button[title^="Trace check"]'));
const gapsAfter = await page.locator('button[title^="Trace check"]').innerText();
await r.moveTo(gaps.x - 10, gaps.y + 62, 30, 20); // rest just under it, without covering it
const fGaps = r.index();
await frame(100);
r.save();
await browser.close();
console.log('gaps', JSON.stringify(gapsBefore), '->', JSON.stringify(gapsAfter), '|', n, 'links');

const inside = (c, k) => ({ x: Math.min(Math.max(c.x, 889 / k), 1600 - 889 / k), y: Math.min(Math.max(c.y, 500 / k), 900 - 500 / k) });
const onList = inside({ x: list.x + list.width / 2 + 260, y: list.y + list.height / 2 }, 1.6);
const camera = cameraFrom([
  [0, start.cam, start.zoom], // shot 8's last framing
  [10, start.cam, start.zoom],
  [fAsk + 4, inside({ x: btn.x + 200, y: btn.y - 120 }, 1.5), 1.5],
  [fAsk + 30, onList, 1.6],
  [marks[marks.length - 1] + 8, onList, 1.6],
  [fAdd + 2, inside({ x: add.x + 260, y: add.y - 140 }, 1.5), 1.5],
  [fAdd + 34, { x: 800, y: 450 }, 1.0],
  [fGaps - 4, { x: 800, y: 450 }, 1.0],
  // end wide enough to see both the "0 gaps" badge and the newly linked cards
  [fGaps + 30, inside({ x: 1060, y: 330 }, 1.35), 1.35],
  [r.log.frames.length - 1, inside({ x: 1070, y: 330 }, 1.38), 1.38],
]);
await render(DIR, camera, 'clips/d09-find-connections-MOCK.mp4');
