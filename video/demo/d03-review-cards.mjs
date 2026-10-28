// Demo shot 3 (Mock rehearsal): review the drafted cards, accept three, reject one, add them to the board.
// Starts where shot 2 ends: the review list open, same camera and cursor.
import fs from 'node:fs';
import { openApp, recorder, centreOf, render, cameraFrom, APP } from './lib.mjs';

const DIR = 'frames/d03';
const FILE = 'triodos-kids-brief.md';
const { browser, page } = await openApp();
await page.goto(APP);
await page.evaluate(() => localStorage.clear());
await page.reload();

// reproduce shot 2 off camera
await page.getByText('Blank board', { exact: true }).click();
await page.locator('input:focus').fill('Triodos Kids');
await page.locator('textarea').first().fill('As cash disappears, children aged 6–12 lose touch with money. How can a bank make it visible again?');
await page.getByRole('button', { name: 'Done' }).click();
await page.getByRole('button', { name: 'Add a document' }).click();
await page.waitForSelector('.sources-drop');
const dt = await page.evaluateHandle(([t, name]) => {
  const d = new DataTransfer();
  d.items.add(new File([t], name, { type: 'text/markdown' }));
  return d;
}, [fs.readFileSync(`assets/${FILE}`, 'utf8'), FILE]);
await page.dispatchEvent('.sources-drop', 'drop', { dataTransfer: dt });
await page.waitForSelector('text=Read with AI');
const read = await centreOf(page, page.getByRole('button', { name: 'Read with AI' }));
await page.getByRole('button', { name: 'Read with AI' }).click();
await page.waitForSelector('text=Add cards to board');
await page.waitForTimeout(400);

const rows = page.locator('.proposal');
const accept = (i) => centreOf(page, rows.nth(i).getByRole('button', { name: '✓ Accept' }));
const reject = (i) => centreOf(page, rows.nth(i).getByRole('button', { name: '✕ Reject' }));

const r = recorder(page, DIR);
await r.place(read.x + 120, read.y + 140); // where shot 2 left the cursor
await r.hold(10);

const marks = [];
for (const [i, pick, n] of [[0, accept, 24], [1, accept, 16], [2, accept, 16], [3, reject, 20]]) {
  await rows.nth(i).scrollIntoViewIfNeeded();
  const b = await pick(i);
  await r.moveTo(b.x, b.y, n, 12);
  await r.hold(4);
  marks.push({ f: r.index(), ...b });
  await r.click();
  // the Assistant panel would cover the new cards; fold it while the camera is in close on the list
  if (i === 0) await page.evaluate(() => document.querySelector('.chat-panel__head')?.click());
  await r.hold(i === 3 ? 18 : 10);
}

const add = await centreOf(page, page.getByRole('button', { name: /Add \d cards? to board/ }));
await r.moveTo(add.x, add.y, 20, 14);
await r.hold(6);
const fAdd = r.index();
await r.click();
// fold the Legend in the same frame the panel closes, so it doesn't cover the new cards
await page.evaluate(() => document.querySelector('.legend button')?.click());
// the panel closes and the board frames the new cards (500 ms): film it at half speed
const t0 = Date.now();
while (Date.now() - t0 < 900) { await r.frame(); r.repeat(1); }
await r.hold(6);
const nodes = await page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
const box = {
  x0: Math.min(...nodes.map((b) => b.left)), x1: Math.max(...nodes.map((b) => b.right)),
  y0: Math.min(...nodes.map((b) => b.top)), y1: Math.max(...nodes.map((b) => b.bottom)),
};
const fBoard = r.index();
await r.moveTo(1240, 780, 28, 20); // out of the way
await r.hold(70);
r.save();
await browser.close();

const [a0, a1, a2, j3] = marks;
const camera = cameraFrom([
  [0, { x: 800, y: 390 }, 1.35], // shot 2's last framing
  [8, { x: 800, y: 390 }, 1.35],
  [a0.f, { x: a0.x - 260, y: a0.y + 40 }, 1.7],
  [a2.f, { x: a2.x - 260, y: (a1.y + a2.y) / 2 }, 1.7],
  [j3.f + 4, { x: j3.x - 260, y: j3.y - 20 }, 1.75],
  [fAdd - 6, { x: add.x - 200, y: add.y - 120 }, 1.55],
  [fAdd + 2, { x: add.x - 200, y: add.y - 120 }, 1.55],
  [fBoard, { x: 800, y: 450 }, 1.05],
  [fBoard + 24, { x: 800, y: 450 }, 1.05],
  [r.log.frames.length - 1, { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }, Math.min(1.6, 1500 / (box.x1 - box.x0 + 160))],
]);
await render(DIR, camera, 'clips/d03-review-cards-MOCK.mp4');
