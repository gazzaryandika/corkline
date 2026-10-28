// Demo shot 2 (Mock rehearsal): close the Project panel, open Sources, drag the brief in, read it.
// Starts where shot 1 ends: the Project panel filled in, same camera and cursor.
import fs from 'node:fs';
import { openApp, recorder, centreOf, render, cameraFrom, APP } from './lib.mjs';

const DIR = 'frames/d02';
const FILE = 'triodos-kids-brief.md';
const { browser, page } = await openApp();
await page.goto(APP);
await page.evaluate(() => localStorage.clear()); // also resets the AI switch to Mock
await page.reload();
await page.getByText('Blank board', { exact: true }).click();
await page.locator('input:focus').fill('Triodos Kids');
await page.locator('textarea').first().fill('As cash disappears, children aged 6–12 lose touch with money. How can a bank make it visible again?');
await page.waitForTimeout(400);

const desc = await centreOf(page, page.locator('textarea').first());
const r = recorder(page, DIR);
await r.place(desc.box.x + desc.box.width - 70, desc.box.y + desc.box.height - 34); // where shot 1 left the cursor
await r.hold(8);

const done = await centreOf(page, page.getByRole('button', { name: 'Done' }));
await r.moveTo(done.x, done.y, 18, 10);
await r.hold(4);
const fDone = r.index();
await r.click();
await page.waitForTimeout(250);
await r.hold(6);

await page.waitForSelector('text=Add a document');
const src = await centreOf(page, page.getByRole('button', { name: 'Add a document' }));
await r.moveTo(src.x, src.y, 24, 30);
await r.hold(6);
const fSrc = r.index();
await r.click();
await page.waitForSelector('.sources-drop');
await r.hold(10);

// the brief is dragged in from the right
const drop = await centreOf(page, page.locator('.sources-drop'));
await r.moveTo(1380, 560, 16, 20);
r.carry = FILE;
await r.hold(10);
const fDrag = r.index();
const dropAt = { x: drop.x - drop.box.width * 0.22, y: drop.box.y + drop.box.height - 22 }; // empty part, clear of the buttons
await r.moveTo(dropAt.x, dropAt.y, 30, -40);
const dt = await page.evaluateHandle(([t, name]) => {
  const d = new DataTransfer();
  d.items.add(new File([t], name, { type: 'text/markdown' }));
  return d;
}, [fs.readFileSync(`assets/${FILE}`, 'utf8'), FILE]);
await page.dispatchEvent('.sources-drop', 'dragover', { dataTransfer: dt });
await r.hold(10);
await page.dispatchEvent('.sources-drop', 'drop', { dataTransfer: dt });
r.carry = null;
const fDrop = r.index();
await r.frame('click');
await page.waitForSelector('text=Read with AI');
await r.hold(14);

const read = await centreOf(page, page.getByRole('button', { name: 'Read with AI' }));
await r.moveTo(read.x, read.y, 20, 16);
await r.hold(6);
const fRead = r.index();
await r.click();
if (await page.locator('text=Reading…').count()) { await r.frame(); r.repeat(20); }
await page.waitForSelector('text=Add cards to board');
await r.hold(10);
await r.moveTo(read.x + 120, read.y + 140, 16, 10);
await r.hold(22);
r.save();
await browser.close();

const camera = cameraFrom([
  [0, { x: desc.x, y: desc.y - 30 }, 1.85], // shot 1's last framing
  [8, { x: desc.x, y: desc.y - 30 }, 1.85],
  [fDone + 5, { x: (done.x + src.x) / 2, y: (done.y + src.y) / 2 }, 1.5],
  [fSrc - 4, { x: src.x, y: src.y + 20 }, 1.8],
  [fSrc + 14, { x: 800, y: 300 }, 1.45],
  [fDrag + 8, { x: 950, y: 330 }, 1.35],
  [fDrop + 8, { x: drop.x, y: drop.y + 60 }, 1.6],
  [fRead + 4, { x: read.x - 220, y: read.y + 10 }, 1.75],
  [fRead + 40, { x: 800, y: 400 }, 1.3],
  [r.log.frames.length - 1, { x: 800, y: 390 }, 1.35],
]);
await render(DIR, camera, 'clips/d02-add-brief-MOCK.mp4');
