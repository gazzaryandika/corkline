// Demo shot 7: the board grows into a whole project, fast. Illustrative cards (not from a real read),
// revealed in a wave from Problem to Prototype while the board zooms out. Starts where shot 6 ends. 10 s.
import { openApp, recorder, render, cameraFrom, ease } from './lib.mjs';
import { growBoard, LANE, PAD } from './stage.mjs';

const DIR = 'frames/d07';
const SECONDS = 10, FPS = 30;
const { browser, page } = await openApp();
const { start, plan, v0, v1, pane } = await growBoard(page);
// when each piece appears: a wave from left to right, with a little jitter so it doesn't feel mechanical
const X0 = PAD, X1 = 6 * LANE + PAD;
const jitter = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 997; return h / 997; };
const waveT = (x, key) => 0.55 + 5.9 * (x - X0) / (X1 - X0) + 0.35 * jitter(key);
const cardT = Object.fromEntries(plan.newIds.map((id) => [id, waveT(plan.pos[id].x, id)]));
const edgeT = Object.fromEntries(plan.edges.map((e) => [e.id, Math.max(cardT[e.source] ?? 0, cardT[e.target] ?? 0) + 0.15]));
// tag each new edge label with its edge (labels carry no id): nearest edge midpoint in board coordinates
await page.evaluate(([edges, pos]) => {
  const mids = edges.map((e) => ({ id: e.id, x: (pos[e.source].x + 240 + pos[e.target].x) / 2, y: (pos[e.source].y + pos[e.target].y) / 2 + 60 }));
  for (const el of document.querySelectorAll('.relation-edge__label-wrap')) {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
    if (!m) continue;
    const [x, y] = [+m[1], +m[2]];
    let best = null, bd = 140;
    for (const e of mids) { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e.id; } }
    if (best) el.dataset.growEdge = best;
  }
}, [plan.edges, plan.pos]);

const viewAt = (t) => {
  const p = ease(Math.min(1, Math.max(0, (t - 0.4) / 6.8)));
  const k = Math.exp(Math.log(v0.k) + (Math.log(v1.k) - Math.log(v0.k)) * p);
  // move the board point under the pane centre along a straight line, so the zoom doesn't swing
  const c0 = { x: (pane.width / 2 - v0.x) / v0.k, y: (pane.height / 2 - v0.y) / v0.k };
  const c1 = { x: (pane.width / 2 - v1.x) / v1.k, y: (pane.height / 2 - v1.y) / v1.k };
  const c = { x: c0.x + (c1.x - c0.x) * p, y: c0.y + (c1.y - c0.y) * p };
  return { x: pane.width / 2 - c.x * k, y: pane.height / 2 - c.y * k, k };
};

await page.addStyleTag({ content: '.card-node, .react-flow__edge, .relation-edge__label-wrap, .lane-guides__label, .lane-guides__line { transition: none !important; }' });
const apply = (t) => page.evaluate(([v, t, cardT, edgeT]) => {
  const pop = (t0) => { const u = Math.min(1, Math.max(0, (t - t0) / 0.32)); return { o: u, s: u >= 1 ? 1 : 0.82 + 0.18 * (1 - Math.pow(1 - u, 3)) + 0.05 * Math.sin(u * Math.PI) }; };
  document.querySelector('.react-flow__viewport').style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  for (const [id, t0] of Object.entries(cardT)) {
    const el = document.querySelector(`.react-flow__node[data-id="${id}"] .card-node`);
    if (!el) continue;
    const p = pop(t0);
    el.style.opacity = p.o; el.style.scale = p.s;
  }
  for (const [id, t0] of Object.entries(edgeT)) {
    const el = document.querySelector(`.react-flow__edge[data-id="${id}"]`);
    if (el) el.style.opacity = Math.min(1, Math.max(0, (t - t0) / 0.3));
  }
  for (const el of document.querySelectorAll('.relation-edge__label-wrap[data-grow-edge]')) {
    const p = pop(edgeT[el.dataset.growEdge] + 0.08);
    el.style.opacity = p.o; el.style.scale = p.s;
  }
  // lane labels and divider lines for lanes that are still empty fade in just ahead of their cards
  for (const el of document.querySelectorAll('.lane-guides__label, .lane-guides__line')) {
    const lane = Math.round(parseFloat(el.style.left) / 900);
    if (lane < 3) continue;
    const t0 = 0.55 + 5.9 * (lane * 900) / (6 * 900) - 0.25;
    el.style.opacity = Math.min(1, Math.max(0, (t - t0) / 0.4));
  }
}, [viewAt(t), t, cardT, edgeT]);
await apply(0);
await page.waitForTimeout(300);

const r = recorder(page, DIR);
const cur0 = start.cursor, cur1 = { x: 1360, y: 770 }; // drift to empty canvas, off the cards and the Legend
for (let f = 0; f < SECONDS * FPS; f++) {
  const t = f / FPS;
  await apply(t);
  const u = ease(Math.min(1, Math.max(0, (t - 0.3) / 1.6)));
  r.pos = { x: cur0.x + (cur1.x - cur0.x) * u, y: cur0.y + (cur1.y - cur0.y) * u };
  await page.mouse.move(r.pos.x, r.pos.y);
  await r.frame();
}
r.save();
await browser.close();

const n = SECONDS * FPS;
const camera = cameraFrom([
  [0, start.cam, start.zoom], // shot 6's last framing
  [12, start.cam, start.zoom],
  [100, { x: 800, y: 450 }, 1.0],
  [n - 1, { x: 800, y: 450 }, 1.03],
]);
await render(DIR, camera, 'clips/d07-growth.mp4');
