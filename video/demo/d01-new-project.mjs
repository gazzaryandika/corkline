// Demo shot 1: from the end of the intro, into the app; start a blank board, name and describe it.
import { execFileSync } from 'node:child_process';
import { openApp, recorder, centreOf, render, cameraFrom, joinWithDissolve, encode1080, APP } from './lib.mjs';

const DIR = 'frames/d01';

// 1. the intro's board panel morphs into the app window (scene timeline 36–36.6 s)
execFileSync('node', ['scene.mjs', 'scenes/problem.html', '0.6', 'frames/d01-morph', '--from', '36', '--frames-only'], { stdio: 'inherit' });

// 2. record the app
const { browser, page } = await openApp();
await page.goto(APP);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('text=Blank board');
await page.waitForTimeout(500);

const r = recorder(page, DIR);
const tile = await centreOf(page, page.locator('button, [role="button"], a', { hasText: 'Blank board' }).first());
const plus = { x: tile.x, y: tile.box.y + 70 }; // the big + in the tile's preview
await r.place(760, 560);
await r.hold(4);
await r.moveTo(plus.x, plus.y, 22, 40);
await r.hold(3);
const fClick = r.index();
await r.click();
await page.waitForSelector('input:focus');
await r.hold(6);
const field = await centreOf(page, page.locator('input:focus'));
const desc = await centreOf(page, page.locator('textarea').first());
await r.moveTo(field.x + 120, field.y - 72, 8, 10); // park in the empty panel header
const fName = r.index();
await r.type('Triodos Kids', 1.5);
await r.hold(3);
await r.moveTo(desc.box.x + 220, desc.box.y + 24, 9, 12);
const fDesc = r.index();
await r.click();
await r.moveTo(desc.box.x + desc.box.width - 70, desc.box.y + desc.box.height - 34, 6, 8); // out of the text's way
await r.type('As cash disappears, children aged 6–12 lose touch with money. How can a bank make it visible again?', 0.5);
await r.hold(16);
r.save();
await browser.close();

const f = field, d = desc;
const camera = cameraFrom([
  [0, { x: 800, y: 450 }, 1],
  [4, { x: 800, y: 450 }, 1],
  [fClick - 1, { x: plus.x + 40, y: plus.y + 40 }, 1.8],
  [fClick + 2, { x: plus.x + 40, y: plus.y + 40 }, 1.8],
  [fName, { x: f.x, y: f.y + 40 }, 1.55],
  [fName + 18, { x: f.x - 40, y: f.y + 20 }, 1.9],
  [fDesc + 6, { x: d.x, y: d.y - 20 }, 1.75],
  [r.log.frames.length - 1, { x: d.x, y: d.y - 30 }, 1.85],
]);
await render(DIR, camera, null, { encode: false });

// 3. morph → dissolve → demo, as one clip
const n = await joinWithDissolve(['frames/d01-morph', `${DIR}/out`], 'frames/d01-final', 8);
encode1080('frames/d01-final', 'clips/d01-new-project.mp4');
console.log('total', n, 'frames =', (n / 30).toFixed(2), 's');
