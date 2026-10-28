// Off-camera setup: bring a fresh app to the state an earlier shot ended in, so the next shot starts on its last frame.
import fs from 'node:fs';
import { centreOf, APP } from './lib.mjs';

const FILE = 'triodos-kids-brief.md';

/** Shot 3's end: three cards from the brief on the board, Assistant and Legend folded. Returns its camera. */
export async function afterShot3(page) {
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
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

  const nodes = await page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  const box = {
    x0: Math.min(...nodes.map((b) => b.left)), x1: Math.max(...nodes.map((b) => b.right)),
    y0: Math.min(...nodes.map((b) => b.top)), y1: Math.max(...nodes.map((b) => b.bottom)),
  };
  return {
    cam: { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 },
    zoom: Math.min(1.6, 1500 / (box.x1 - box.x0 + 160)),
    cursor: { x: 1240, y: 780 },
  };
}

/** Shot 4's end: the first Problem linked to the Assumption with "Leads to". Returns its camera and cursor. */
export async function afterShot4(page) {
  const s3 = await afterShot3(page);
  const problem = page.locator('.react-flow__node', { hasText: 'As cash disappears' });
  const asm = page.locator('.react-flow__node', { hasText: 'Triodos assumes' });
  const dot = await centreOf(page, problem.locator('.card-node__connector'));
  const target = await centreOf(page, asm);
  await page.mouse.move(dot.x, dot.y);
  await page.mouse.down();
  await page.mouse.move(target.x - 20, target.y + 10, { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector('text=Leads to');
  const leads = await centreOf(page, page.getByRole('button', { name: 'Leads to' }));
  await page.getByRole('button', { name: 'Leads to' }).click();
  await page.mouse.move(leads.x + 60, leads.y + 110);
  await page.waitForTimeout(300);
  const mid = { x: (dot.x + target.x) / 2, y: (dot.y + target.y) / 2 };
  return { cam: { x: mid.x, y: mid.y + 20 }, zoom: s3.zoom * 1.08, cursor: { x: leads.x + 60, y: leads.y + 110 } };
}

export const NEW_ASSUMPTION = {
  title: 'Kids learn money by doing, not by being told',
  body: 'If they save and spend it themselves, the lesson sticks.',
};

/** Shot 5's end: a hand-made Assumption, linked from the second Problem. Returns its camera and cursor. */
export async function afterShot5(page) {
  const s4 = await afterShot4(page);
  const ids = () => page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.dataset.id));
  const before = await ids();
  await page.getByRole('button', { name: /Assumption/ }).first().click();
  await page.waitForTimeout(500);
  const newId = (await ids()).find((id) => !before.includes(id));
  const card = page.locator(`.react-flow__node[data-id="${newId}"]`);
  await card.locator('.card-node__title').fill(NEW_ASSUMPTION.title);
  await card.locator('.card-node__text').fill(NEW_ASSUMPTION.body);
  const problem2 = page.locator('.react-flow__node', { hasText: 'Parents feel responsible' });
  const dot = await centreOf(page, problem2.locator('.card-node__connector'));
  const target = await centreOf(page, card);
  await page.mouse.move(dot.x, dot.y);
  await page.mouse.down();
  await page.mouse.move(target.x - 20, target.y + 10, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Leads to', exact: true }).click();
  const mid = { x: (dot.x + target.x) / 2, y: (dot.y + target.y) / 2 };
  const cursor = { x: mid.x + 40, y: target.y + 190 };
  await page.mouse.move(cursor.x, cursor.y);
  await page.waitForTimeout(300);
  const k = s4.zoom;
  const cam = k <= 1.12 ? { x: 800, y: 470 } : {
    x: Math.min(Math.max(800, 889 / k), 1600 - 889 / k),
    y: Math.min(Math.max(470, 500 / k), 900 - 500 / k),
  };
  return { cam, zoom: k, cursor, assumptionId: newId };
}

/** Shot 6's end: the interview read, its four Evidence cards added, three linked from the new Assumption. */
export async function afterShot6(page) {
  const s5 = await afterShot5(page);
  const asmCard = page.locator(`.react-flow__node[data-id="${s5.assumptionId}"]`);
  const ids = () => page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.dataset.id));
  const before = await ids();
  const IFILE = 'interview-mila-and-dad.md';
  await page.locator('button[title^="Documents behind this project"]').click();
  await page.waitForSelector('.sources-drop');
  const dt = await page.evaluateHandle(([t, name]) => {
    const d = new DataTransfer();
    d.items.add(new File([t], name, { type: 'text/markdown' }));
    return d;
  }, [fs.readFileSync(`assets/${IFILE}`, 'utf8'), IFILE]);
  await page.dispatchEvent('.sources-drop', 'drop', { dataTransfer: dt });
  const row = page.locator('.source-row').filter({ has: page.locator('input[value^="interview-mila-and-dad"]') });
  await row.getByRole('button', { name: 'Read with AI' }).click();
  await page.getByRole('button', { name: 'Accept all' }).click();
  await page.getByRole('button', { name: /Add \d cards? to board/ }).click();
  await page.waitForTimeout(1200);
  const newIds = (await ids()).filter((id) => !before.includes(id));
  const asm0 = await asmCard.boundingBox();
  const ev0 = await page.locator(`.react-flow__node[data-id="${newIds[0]}"]`).boundingBox();
  const grab = { x: (asm0.x + asm0.width + ev0.x) / 2, y: ev0.y + 200 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 300 - asm0.x, grab.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  for (const quote of ['ice cream', 'birthday money']) {
    const dot = await centreOf(page, asmCard.locator('.card-node__connector'));
    const target = await centreOf(page, page.locator('.react-flow__node', { hasText: quote }).filter({ has: page.locator('.card-node') }).first());
    await page.mouse.move(dot.x, dot.y);
    await page.mouse.down();
    await page.mouse.move(target.x - 30, target.y + 6, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Leads to', exact: true }).click();
  }
  const boxes = await Promise.all([s5.assumptionId, ...newIds].map((id) => page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox()));
  const asmBox = boxes[0];
  const reg = {
    x0: Math.min(...boxes.map((b) => b.x)), x1: Math.max(...boxes.map((b) => b.x + b.width)),
    y0: Math.min(...boxes.map((b) => b.y)), y1: Math.max(...boxes.map((b) => b.y + b.height)),
  };
  const cursor = { x: (asmBox.x + asmBox.width + reg.x1 - 240) / 2, y: reg.y1 - 30 };
  await page.mouse.move(cursor.x, cursor.y);
  await page.waitForTimeout(300);
  const regC = { x: (reg.x0 + reg.x1) / 2, y: (reg.y0 + reg.y1) / 2 };
  const regZ = Math.min(1.9, 1500 / (reg.x1 - reg.x0 + 200), 820 / (reg.y1 - reg.y0 + 120));
  const k = Math.min(regZ, 1.3) * 0.97;
  const cam = k <= 1.12 ? regC : {
    x: Math.min(Math.max(regC.x, 889 / k), 1600 - 889 / k),
    y: Math.min(Math.max(regC.y, 500 / k), 900 - 500 / k),
  };
  return { cam, zoom: k, cursor };
}

// ---------- shot 7: the board grown into a whole project (illustrative cards) ----------

export const LANE = 900, PAD = 124, SUB = 408; // the app's grid (lib/grid.ts): lanes 900 wide, two card columns each
const at = (lane, sub, y) => ({ x: lane * LANE + PAD + sub * SUB, y });

// new cards: [key, type, lane, column, y, title]
// all below the board's top row, so the lane labels stay where shot 6 had them
export const CARDS = [
  ['P3', 'problem', 0, 0, 1500, 'Pocket money is moving into apps that parents control'],
  ['A4', 'assumption', 1, 1, 700, 'Seeing money grow motivates kids to save'],
  ['A3', 'assumption', 1, 0, 1600, 'Parents want kids to handle some money on their own'],
  ['E9', 'evidence', 2, 1, 250, 'Kid, 11: “I check my balance but I don’t feel it”'],
  ['E5', 'evidence', 2, 1, 650, 'Teacher: kids can’t say where card money comes from'],
  ['E8', 'evidence', 2, 0, 900, 'Kid, 7: “Money lives inside the phone”'],
  ['E6', 'evidence', 2, 1, 1100, 'Reddit, 121 threads: money has become invisible'],
  ['E7', 'evidence', 2, 1, 1600, 'Parent: “We stopped giving coins two years ago”'],
  ['I1', 'insight', 3, 0, 150, 'Money feels real when kids can see or touch it'],
  ['I4', 'insight', 3, 1, 600, 'Digital balances leave no trace at home'],
  ['I2', 'insight', 3, 0, 1000, 'Ownership drives engagement'],
  ['I5', 'insight', 3, 1, 1350, 'Kids track progress, not amounts'],
  ['I3', 'insight', 3, 0, 1750, 'Parents want to coach, not control'],
  ['O1', 'opportunity', 4, 0, 350, 'Make digital money visible at home'],
  ['O4', 'opportunity', 4, 1, 800, 'Turn chores into visible earnings'],
  ['O2', 'opportunity', 4, 0, 1200, 'Give kids a goal they can watch grow'],
  ['O3', 'opportunity', 4, 1, 1750, 'Let parents coach instead of control'],
  ['D1', 'direction', 5, 0, 550, 'A savings jar that fills as the balance grows'],
  ['D3', 'direction', 5, 1, 1100, 'A kids’ card with a progress light'],
  ['D2', 'direction', 5, 0, 1650, 'A Sunday family money ritual'],
  ['T1', 'prototype', 6, 0, 600, 'Cardboard jar prototype, tested with 5 families'],
  ['T3', 'prototype', 6, 1, 1150, 'Progress-light card mock-up'],
  ['T2', 'prototype', 6, 0, 1700, 'Ritual cards: a one-week diary study'],
];
// links: [from, to, kind]; P1/A1/P2/A2/E1–E4 are the cards already on the board. None touch A1 or E4,
// so their warnings from shot 6 stay as they were (the first frame has to match)
export const LINKS = [
  ['P1', 'A4', 'leads'], ['P3', 'A3', 'leads'],
  ['A4', 'E9', 'leads'], ['A4', 'E8', 'leads'], ['A4', 'E5', 'leads'], ['A4', 'E6', 'leads'], ['A3', 'E7', 'leads'],
  ['E9', 'I1', 'supports'], ['E8', 'I1', 'supports'], ['E1', 'I1', 'supports'],
  ['E5', 'I4', 'supports'], ['E6', 'I4', 'supports'],
  ['E2', 'I2', 'supports'], ['E3', 'I2', 'supports'], ['E2', 'I5', 'supports'], ['E7', 'I3', 'supports'],
  ['I1', 'O1', 'leads'], ['I4', 'O1', 'leads'], ['I2', 'O4', 'leads'], ['I5', 'O4', 'leads'], ['I2', 'O2', 'leads'], ['I5', 'O2', 'leads'], ['I3', 'O3', 'leads'],
  ['O1', 'D1', 'leads'], ['O2', 'D1', 'leads'], ['O4', 'D3', 'leads'], ['O2', 'D3', 'leads'], ['O3', 'D2', 'leads'],
  ['D1', 'T1', 'leads'], ['D3', 'T3', 'leads'], ['D2', 'T2', 'leads'],
];
const EXISTING = {
  P1: 'As cash disappears', A1: 'Triodos assumes', P2: 'Parents feel responsible', A2: 'Kids learn money by doing',
  E1: 'When I pay for my ice cream', E2: 'I keep my birthday money', E3: 'She only understood saving', E4: 'In my banking app',
};


/** Shot 6's board plus the illustrative cards and links, reloaded (nothing hidden yet). Returns where things are,
 * shot 6's viewport (v0) and the whole-board viewport shot 7 ends on (v1). */
export async function growBoard(page) {
  const start = await afterShot6(page);
  const vp0 = await page.evaluate(() => document.querySelector('.react-flow__viewport').style.transform);
  // let the board save: wait until every card we build on is in localStorage
  await page.waitForFunction((texts) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('corkline-project:') && localStorage.getItem(k).includes('As cash disappears')); // not the Welcome tour board
    const doc = key && JSON.parse(localStorage.getItem(key));
    return doc && doc.edges.length >= 4 && texts.every((t) => doc.nodes.some((n) => (n.data.title || '').includes(t)));
  }, Object.values(EXISTING), { timeout: 10000 });

  // add the illustrative cards and links to the saved board, then reload it
  const plan = await page.evaluate(([CARDS, LINKS, EXISTING]) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('corkline-project:') && localStorage.getItem(k).includes('As cash disappears')); // not the Welcome tour board
    const doc = JSON.parse(localStorage.getItem(key));
    const id = {};
    for (const [k, text] of Object.entries(EXISTING)) id[k] = doc.nodes.find((n) => (n.data.title || '').includes(text)).id;
    const pos = {};
    for (const n of doc.nodes) pos[n.id] = n.position;
    for (const [k, nodeType, x, y, title] of CARDS) {
      id[k] = `grow-${k}`;
      pos[id[k]] = { x, y };
      doc.nodes.push({ id: id[k], type: 'card', position: { x, y }, data: { nodeType, title, body: '' }, dragHandle: '.card-node__bar' });
    }
    const edges = LINKS.map(([a, b, kind], i) => ({ id: `grow-e${i}`, type: 'relation', source: id[a], target: id[b], data: { kind } }));
    doc.edges.push(...edges);
    localStorage.setItem(key, JSON.stringify(doc));
    return { pos, edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })), newIds: CARDS.map(([k]) => id[k]) };
  }, [CARDS.map(([k, type, lane, sub, y, title]) => [k, type, at(lane, sub, y).x, at(lane, sub, y).y, title]), LINKS, EXISTING]);
  await page.reload();
  await page.waitForSelector('.react-flow__node[data-id="grow-T3"]');
  await page.evaluate(() => {
    document.querySelector('.chat-panel__head')?.click();
    document.querySelector('.legend button')?.click();
  });
  await page.waitForTimeout(800);

  // the viewport: from shot 6's framing out to the whole board
  const parse = (s) => { const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(s); return { x: +m[1], y: +m[2], k: +m[3] }; };
  const v0 = parse(vp0);
  const pane = await page.locator('.react-flow').boundingBox();
  const all = Object.values(plan.pos);
  const bb = { x0: Math.min(...all.map((p) => p.x)), x1: Math.max(...all.map((p) => p.x)) + 240, y0: Math.min(...all.map((p) => p.y)) - 90, y1: Math.max(...all.map((p) => p.y)) + 170 };
  const k1 = Math.min((pane.width - 80) / (bb.x1 - bb.x0), (pane.height - 60) / (bb.y1 - bb.y0));
  const v1 = { k: k1, x: pane.width / 2 - k1 * (bb.x0 + bb.x1) / 2, y: (pane.height - 40) / 2 - k1 * (bb.y0 + bb.y1) / 2 + 20 };
  return { start, plan, v0, v1, pane };
}

/** Shot 7's end: the whole grown board in view, Assistant and Legend folded. */
export async function afterShot7(page) {
  const g = await growBoard(page);
  const setView = () => page.evaluate((v) => {
    document.querySelector('.react-flow__viewport').style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  }, g.v1);
  await setView();
  await page.mouse.move(1360, 770);
  await page.waitForTimeout(300);
  return { cam: { x: 800, y: 450 }, zoom: 1.03, cursor: { x: 1360, y: 770 }, setView };
}

/** Shot 8's end: the grown board with the AI Assistant panel open, the camera in on the panel. */
export async function afterShot8(page) {
  const s7 = await afterShot7(page);
  await page.locator('.chat-panel__head').click();
  await page.waitForTimeout(400);
  await s7.setView();
  const panel = await page.locator('.chat-panel').boundingBox();
  const cursor = { x: panel.x + panel.width * 0.72, y: panel.y + panel.height * 0.5 };
  await page.mouse.move(cursor.x, cursor.y);
  // same framing as shot 8's last frame (d08-ai-assistant.mjs)
  const k = 1.45;
  const c = { x: panel.x - 30 + 889 / k * 0.98, y: panel.y + panel.height / 2 };
  const on = { x: Math.min(Math.max(c.x, 889 / k), 1600 - 889 / k), y: Math.min(Math.max(c.y, 500 / k), 900 - 500 / k) };
  return { cam: { x: on.x + 6, y: on.y }, zoom: k * 1.02, cursor, setView: s7.setView };
}
