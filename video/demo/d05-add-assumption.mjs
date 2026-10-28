// Demo shot 5: add an Assumption card by hand, fill it in, and link the second Problem to it.
// Starts where shot 4 ends. Normal pace.
import { openApp, recorder, centreOf, render, cameraFrom } from './lib.mjs';
import { afterShot4 } from './stage.mjs';

const DIR = 'frames/d05';
const TITLE = 'Kids learn money by doing, not by being told';
const BODY = 'If they save and spend it themselves, the lesson sticks.';

const { browser, page } = await openApp();
const start = await afterShot4(page);

const addBtn = await centreOf(page, page.getByRole('button', { name: /Assumption/ }).first());
const ids = () => page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.dataset.id));
const before = await ids();
const r = recorder(page, DIR);
await r.place(start.cursor.x, start.cursor.y);
await r.hold(8);

// 1. add the card from the toolbar
await r.moveTo(addBtn.x, addBtn.y, 30, 40);
await r.hold(8);
const fAdd = r.index();
await r.click();
await page.waitForTimeout(500); // let it land (and the view settle if it had to scroll)
await r.hold(12);

// 2. fill it in
const newId = (await ids()).find((id) => !before.includes(id));
const card = page.locator(`.react-flow__node[data-id="${newId}"]`);
const title = await centreOf(page, card.locator('.card-node__title'));
await r.moveTo(title.box.x + 40, title.y, 30, -30);
await r.hold(6);
const fTitle = r.index();
await r.click();
const cbox = await card.boundingBox();
const park = { x: cbox.x + cbox.width * 0.7, y: cbox.y + cbox.height + 46 }; // below the card, clear of the text
await r.moveTo(park.x, park.y, 10, 10);
await r.type(TITLE, 0.8);
await r.hold(10);
await page.keyboard.press('Enter');
const text = await centreOf(page, card.locator('.card-node__text'));
await r.moveTo(text.box.x + 40, text.y, 12, 10);
await r.hold(4);
await r.click();
const fBody = r.index();
await r.moveTo(park.x, park.y + 20, 8, 8);
await r.type(BODY, 0.6);
await r.hold(16);

// 3. link the second Problem to it
const problem2 = page.locator('.react-flow__node', { hasText: 'Parents feel responsible' });
const dot = await centreOf(page, problem2.locator('.card-node__connector'));
const target = await centreOf(page, card);
const mid = { x: (dot.x + target.x) / 2, y: (dot.y + target.y) / 2 };
await r.moveTo(dot.x, dot.y, 30, 40);
await r.hold(6);
const fDown = r.index();
await page.mouse.down();
r.dragging = true;
await r.frame('click');
await r.moveTo(target.x - 20, target.y + 10, 34, -30);
await r.hold(4);
await page.mouse.up();
r.dragging = false;
const fUp = r.index();
await r.frame();
await page.getByRole('button', { name: 'Leads to', exact: true }).waitFor();
await r.hold(12);
const leads = await centreOf(page, page.getByRole('button', { name: 'Leads to', exact: true }));
await r.moveTo(leads.x, leads.y, 16, 10);
await r.hold(6);
await r.click();
await r.hold(8);
await r.moveTo(mid.x + 40, target.y + 190, 20, 10); // into empty canvas
await r.hold(20);
r.save();
await browser.close();

const z = start.zoom;
// keep a zoomed-in view inside the app window (no backdrop showing past its edge)
// (the scene shows 1600 × 900 CSS px of app at zoom 1.11, so half the view is 889/k by 500/k)
const inside = (c, k) => k <= 1.12 ? c : {
  x: Math.min(Math.max(c.x, 889 / k), 1600 - 889 / k),
  y: Math.min(Math.max(c.y, 500 / k), 900 - 500 / k),
};
const keys = ([
  [0, start.cam, z],
  [8, start.cam, z],
  [fAdd - 4, { x: addBtn.x + 120, y: addBtn.y + 140 }, 1.7],
  [fAdd + 8, { x: addBtn.x + 120, y: addBtn.y + 140 }, 1.7],
  [fTitle, { x: title.x - 40, y: title.y + 50 }, 1.75],
  [fBody + 10, { x: title.x - 40, y: title.y + 60 }, 1.75],
  [fDown, { x: mid.x, y: mid.y }, z * 1.05],
  [fUp, { x: mid.x + 50, y: mid.y + 20 }, z * 1.12],
  [fUp + 30, { x: mid.x + 50, y: mid.y + 20 }, z * 1.12],
  [r.log.frames.length - 1, { x: 800, y: 470 }, z],
]);
const camera = cameraFrom(keys.map(([f, c, k], i) => [f, i < 2 ? c : inside(c, k), k])); // the first keys are shot 4's last frame
await render(DIR, camera, 'clips/d05-add-assumption.mp4');
