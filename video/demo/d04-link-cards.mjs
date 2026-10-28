// Demo shot 4 (Mock rehearsal): link a Problem card to the Assumption card by hand.
// Starts where shot 3 ends: the three new cards on the board, same camera and cursor.
import fs from 'node:fs';
import { openApp, recorder, centreOf, render, cameraFrom, APP } from './lib.mjs';

const DIR = 'frames/d04';
const FILE = 'triodos-kids-brief.md';
const { browser, page } = await openApp();
await page.goto(APP);
await page.evaluate(() => localStorage.clear());
await page.reload();

// reproduce shots 2 and 3 off camera
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
await page.getByRole('button', { name: 'Read with AI' }).click();
await page.waitForSelector('text=Add cards to board');
const rows = page.locator('.proposal');
for (const i of [0, 1, 2]) await rows.nth(i).getByRole('button', { name: '✓ Accept' }).click();
await rows.nth(3).getByRole('button', { name: '✕ Reject' }).click();
await page.evaluate(() => document.querySelector('.chat-panel__head')?.click());
await page.getByRole('button', { name: /Add \d cards? to board/ }).click();
await page.evaluate(() => document.querySelector('.legend button')?.click());
await page.waitForTimeout(1200);

// same framing as shot 3's last frame
const nodes = await page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
const box = {
  x0: Math.min(...nodes.map((b) => b.left)), x1: Math.max(...nodes.map((b) => b.right)),
  y0: Math.min(...nodes.map((b) => b.top)), y1: Math.max(...nodes.map((b) => b.bottom)),
};
const endCam = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
const endZoom = Math.min(1.6, 1500 / (box.x1 - box.x0 + 160));

const problem = page.locator('.react-flow__node', { hasText: 'As cash disappears' });
const asm = page.locator('.react-flow__node', { hasText: 'Triodos assumes' });
const dot = await centreOf(page, problem.locator('.card-node__connector'));
const target = await centreOf(page, asm);

const r = recorder(page, DIR);
await r.place(1240, 780); // where shot 3 left the cursor
await r.hold(4);
await r.moveTo(dot.x, dot.y, 18, -30);
await r.hold(3);
const fDown = r.index();
await page.mouse.down();
r.dragging = true;
await r.frame('click');
await r.moveTo(target.x - 20, target.y + 10, 26, -40);
await r.hold(2);
await page.mouse.up();
r.dragging = false;
const fUp = r.index();
await r.frame();
await page.waitForSelector('text=Leads to');
await r.hold(6);
const leads = await centreOf(page, page.getByRole('button', { name: 'Leads to' }));
await r.moveTo(leads.x, leads.y, 12, 10);
await r.hold(3);
await r.click();
await r.hold(4);
await r.moveTo(leads.x + 60, leads.y + 110, 12, 10);
await r.hold(72); // room for the voiceover line
r.save();
await browser.close();

const mid = { x: (dot.x + target.x) / 2, y: (dot.y + target.y) / 2 };
const camera = cameraFrom([
  [0, endCam, endZoom],
  [4, endCam, endZoom],
  [fDown, { x: mid.x - 20, y: mid.y + 10 }, endZoom * 1.08],
  [fUp, { x: mid.x + 50, y: mid.y + 30 }, endZoom * 1.12],
  [fUp + 14, { x: mid.x + 50, y: mid.y + 30 }, endZoom * 1.12],
  [r.log.frames.length - 1, { x: mid.x, y: mid.y + 20 }, endZoom * 1.08],
]);
await render(DIR, camera, 'clips/d04-link-cards-MOCK.mp4');
