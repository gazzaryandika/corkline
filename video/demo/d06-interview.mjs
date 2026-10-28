// Demo shot 6 (Mock rehearsal): add an interview transcript, read it, accept all, add the cards,
// then link the hand-made Assumption to the Evidence that backs it. Starts where shot 5 ends. Unhurried.
import fs from 'node:fs';
import { openApp, recorder, centreOf, render, cameraFrom } from './lib.mjs';
import { afterShot5 } from './stage.mjs';

const DIR = 'frames/d06';
const FILE = 'interview-mila-and-dad.md';
// the three quotes that bear on "Kids learn money by doing"; the banking-app one is left for later
const LINK_TO = ['ice cream', 'birthday money']; // found in the cards' 9-word titles

const { browser, page } = await openApp();
const start = await afterShot5(page);
const asmCard = page.locator(`.react-flow__node[data-id="${start.assumptionId}"]`);
const ids = () => page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.dataset.id));
const before = await ids();

const r = recorder(page, DIR);
await r.place(start.cursor.x, start.cursor.y);
await r.hold(8);

// 1. open Sources
const srcBtn = await centreOf(page, page.locator('button[title^="Documents behind this project"]'));
await r.moveTo(srcBtn.x, srcBtn.y, 30, 40);
await r.hold(8);
const fSrc = r.index();
await r.click();
await page.waitForSelector('.sources-drop');
await r.hold(16);

// 2. drag the transcript in
const drop = await centreOf(page, page.locator('.sources-drop'));
await r.moveTo(1380, 600, 20, 20);
r.carry = FILE;
await r.hold(12);
const fDrag = r.index();
const dropAt = { x: drop.x - drop.box.width * 0.22, y: drop.box.y + drop.box.height - 22 };
await r.moveTo(dropAt.x, dropAt.y, 34, -40);
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
const row = page.locator('.source-row').filter({ has: page.locator(`input[value^="${FILE.replace('.md', '')}"]`) });
await row.getByRole('button', { name: 'Read with AI' }).waitFor();
await r.hold(10);

// 3. the kind was guessed from the name: Interview transcript. Read it.
const kind = await centreOf(page, row.locator('select[aria-label="Document kind"]'));
await r.moveTo(kind.x + 20, kind.y + 26, 22, 12); // rest just under the kind, so it reads
await r.hold(20);
const fKind = r.index() - 20;
const read = await centreOf(page, row.getByRole('button', { name: 'Read with AI' }));
await r.moveTo(read.x, read.y, 20, 12);
await r.hold(6);
const fRead = r.index();
await r.click();
if (await page.locator('text=Reading…').count()) { await r.frame(); r.repeat(12); }
await page.waitForSelector('text=Accept all');
await r.hold(16);

// 4. accept all, add them
const acceptAll = await centreOf(page, page.getByRole('button', { name: 'Accept all' }));
await r.moveTo(acceptAll.x, acceptAll.y, 24, 14);
await r.hold(6);
const fAccept = r.index();
await r.click();
await r.hold(14);
const add = await centreOf(page, page.getByRole('button', { name: /Add \d cards? to board/ }));
await r.moveTo(add.x, add.y, 26, 14);
await r.hold(6);
const fAdd = r.index();
await r.click();
const t0 = Date.now();
while (Date.now() - t0 < 900) { await r.frame(); r.repeat(1); }
await r.hold(14);

// 5. drag the canvas so the Assumption and the new Evidence are both in view (keeps the zoom readable)
const newIds = (await ids()).filter((id) => !before.includes(id));
const box = async (loc) => (await loc.boundingBox());
const asm0 = await box(asmCard);
const ev0 = await box(page.locator(`.react-flow__node[data-id="${newIds[0]}"]`));
const grab = { x: (asm0.x + asm0.width + ev0.x) / 2, y: ev0.y + 200 }; // empty canvas between the columns
const dx = 300 - asm0.x;
await r.moveTo(grab.x, grab.y, 28, 30);
await r.hold(6);
const fPan = r.index();
await page.mouse.down();
r.dragging = true;
await r.frame();
await r.moveTo(grab.x + dx, grab.y, 34, 0);
await page.mouse.up();
r.dragging = false;
await r.hold(14);

// 6. link the Assumption to the Evidence that backs it
const asmBox = await box(asmCard);
const links = [];
for (const quote of LINK_TO) {
  const ev = page.locator('.react-flow__node', { hasText: quote }).filter({ has: page.locator('.card-node') });
  const dot = await centreOf(page, asmCard.locator('.card-node__connector'));
  const target = await centreOf(page, ev.first());
  await r.moveTo(dot.x, dot.y, links.length ? 20 : 28, 20);
  await r.hold(5);
  const fDown = r.index();
  await page.mouse.down();
  r.dragging = true;
  await r.frame('click');
  await r.moveTo(target.x - 30, target.y + 6, 26, -20);
  await r.hold(3);
  await page.mouse.up();
  r.dragging = false;
  await r.frame();
  await page.getByRole('button', { name: 'Leads to', exact: true }).waitFor();
  await r.hold(8);
  const leads = await centreOf(page, page.getByRole('button', { name: 'Leads to', exact: true }));
  await r.moveTo(leads.x, leads.y, 12, 8);
  await r.hold(4);
  await r.click();
  await r.hold(10);
  links.push({ fDown, fEnd: r.index(), mid: { x: (dot.x + target.x) / 2, y: (dot.y + target.y) / 2 } });
}
const evBoxes = await Promise.all(newIds.map((id) => box(page.locator(`.react-flow__node[data-id="${id}"]`))));
const all = [asmBox, ...evBoxes];
const reg = {
  x0: Math.min(...all.map((b) => b.x)), x1: Math.max(...all.map((b) => b.x + b.width)),
  y0: Math.min(...all.map((b) => b.y)), y1: Math.max(...all.map((b) => b.y + b.height)),
};
await r.moveTo((asmBox.x + asmBox.width + reg.x1 - 240) / 2, reg.y1 - 30, 22, 10); // empty canvas between the columns
await r.hold(26);
r.save();
await browser.close();

// keep zoomed-in views inside the app window (see shot 5)
const inside = (c, k) => k <= 1.12 ? c : {
  x: Math.min(Math.max(c.x, 889 / k), 1600 - 889 / k),
  y: Math.min(Math.max(c.y, 500 / k), 900 - 500 / k),
};
const regC = { x: (reg.x0 + reg.x1) / 2, y: (reg.y0 + reg.y1) / 2 };
const regZ = Math.min(1.9, 1500 / (reg.x1 - reg.x0 + 200), 820 / (reg.y1 - reg.y0 + 120));
const keys = [
  [0, start.cam, start.zoom], // shot 5's last framing
  [8, start.cam, start.zoom],
  [fSrc - 4, { x: srcBtn.x + 100, y: srcBtn.y + 160 }, 1.6],
  [fSrc + 16, { x: 800, y: 320 }, 1.4],
  [fDrag + 10, { x: 950, y: 360 }, 1.35],
  [fDrop + 8, { x: drop.x, y: drop.y + 60 }, 1.55],
  [fKind + 4, { x: kind.x + 120, y: kind.y + 20 }, 1.9],
  [fRead + 4, { x: read.x - 160, y: read.y + 20 }, 1.8],
  [fRead + 40, { x: 800, y: 400 }, 1.3],
  [fAccept - 4, { x: acceptAll.x + 220, y: acceptAll.y + 160 }, 1.55],
  [fAccept + 18, { x: acceptAll.x + 220, y: acceptAll.y + 200 }, 1.45],
  [fAdd - 4, { x: add.x - 200, y: add.y - 120 }, 1.55],
  [fAdd + 24, { x: 800, y: 450 }, 1.1],
  [fPan, { x: 800, y: 450 }, 1.1],
  [fPan + 40, regC, Math.min(regZ, 1.3)],
  ...links.flatMap((l) => [[l.fDown - 2, { x: l.mid.x - 50, y: l.mid.y + 30 }, 1.4], [l.fEnd - 6, { x: l.mid.x - 40, y: l.mid.y + 40 }, 1.4]]),
  [r.log.frames.length - 30, regC, Math.min(regZ, 1.3)],
  [r.log.frames.length - 1, regC, Math.min(regZ, 1.3) * 0.97],
];
const camera = cameraFrom(keys.map(([f, c, k], i) => [f, i < 2 ? c : inside(c, k), k])); // the first keys are shot 5's last frame
await render(DIR, camera, 'clips/d06-interview-MOCK.mp4');
