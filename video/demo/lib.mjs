// Shared tools for demo shots: record the real app frame by frame, then render with
// backdrop, rounded window, camera moves, custom cursors and click ripples.
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

export const APP = 'http://localhost:5173/';
export const VW = 1600, VH = 900, DPR = 2, FPS = 30;
const ROOT = path.dirname(new URL(import.meta.url).pathname);

// ---------- easing ----------
export const clamp = (v) => Math.min(1, Math.max(0, v));
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// ---------- recording ----------
export async function openApp() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000); // a busy machine can stall a 2x screenshot well past the 30 s default
  return { browser, page };
}

export function recorder(page, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const log = { frames: [], marks: {} };
  const r = {
    pos: { x: VW / 2, y: VH / 2 },
    dragging: false,
    carry: null, // a file label drawn next to the cursor, e.g. while dragging a document in
    log,
    async isHand() {
      if (r.dragging) return true;
      return page.evaluate(({ x, y }) => {
        for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) {
          if (el.classList.contains('react-flow__pane')) return false; // empty canvas: plain arrow
          const c = getComputedStyle(el).cursor;
          if (['pointer', 'grab', 'grabbing', 'crosshair'].includes(c)) return true;
          if (c !== 'auto' && c !== 'default') return false;
        }
        return false;
      }, r.pos);
    },
    async frame(event) {
      await page.waitForTimeout(25);
      await page.screenshot({ path: `${dir}/${String(log.frames.length).padStart(4, '0')}.png` });
      log.frames.push({ x: r.pos.x, y: r.pos.y, hand: await r.isHand(), event, carry: r.carry });
    },
    async hold(n) { for (let i = 0; i < n; i++) await r.frame(); },
    // repeat the last captured frame (stretch a brief state, e.g. a spinner, without waiting in real time)
    repeat(n) {
      const last = log.frames.length - 1;
      for (let i = 0; i < n; i++) {
        fs.copyFileSync(`${dir}/${String(last).padStart(4, '0')}.png`, `${dir}/${String(log.frames.length).padStart(4, '0')}.png`);
        log.frames.push({ ...log.frames[last], event: undefined });
      }
    },
    async place(x, y) { r.pos = { x, y }; await page.mouse.move(x, y); },
    // eased move along a gentle arc (bend = sideways offset in px at the midpoint)
    async moveTo(x, y, n, bend = 30) {
      const a = { ...r.pos }, dx = x - a.x, dy = y - a.y, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let i = 1; i <= n; i++) {
        const t = ease(i / n), arc = Math.sin(Math.PI * t) * bend;
        r.pos = { x: a.x + dx * t + nx * arc, y: a.y + dy * t + ny * arc };
        await page.mouse.move(r.pos.x, r.pos.y);
        await r.frame();
      }
    },
    async click() { await page.mouse.down(); await page.mouse.up(); await r.frame('click'); },
    // framesPerChar >= 1 types one character every n frames; below 1, several characters per frame
    async type(text, framesPerChar = 2) {
      const step = framesPerChar >= 1 ? 1 : Math.round(1 / framesPerChar);
      for (let i = 0; i < text.length; i += step) {
        await page.keyboard.type(text.slice(i, i + step));
        await r.hold(framesPerChar >= 1 ? framesPerChar : 1);
      }
    },
    mark(name, value) { log.marks[name] = value; },
    index() { return log.frames.length; },
    save() { fs.writeFileSync(`${dir}/log.json`, JSON.stringify(log)); },
  };
  return r;
}

export async function centreOf(page, locator) {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}

// ---------- rendering ----------
// Scene is 4K; output is 1080p, so zooms up to 2x stay sharp.
const SW = 3840, SH = 2160, OW = 1920, OH = 1080;
const APP_W = 3456, APP_H = 1944, OX = (SW - APP_W) / 2, OY = (SH - APP_H) / 2;
const K = APP_W / VW; // CSS px -> scene px
const toScene = (p) => ({ x: OX + p.x * K, y: OY + p.y * K });

async function prepCursor(file, sizePx, hot) {
  const sized = await sharp(file).resize(sizePx, sizePx).png().toBuffer();
  const pad = Math.round(sizePx * 0.4);
  const shadowLayer = await sharp(sized).ensureAlpha().linear([0, 0, 0, 0.35], [0, 0, 0, 0]).toBuffer();
  const canvas = { create: { width: sizePx + pad * 2, height: sizePx + pad * 2, channels: 4, background: '#0000' } };
  const shadowBlur = await sharp(canvas).composite([{ input: shadowLayer, left: pad + 3, top: pad + 6 }]).blur(6).png().toBuffer();
  return { buf: await sharp(shadowBlur).composite([{ input: sized, left: pad, top: pad }]).png().toBuffer(), pad, scale: sizePx / 512, hot };
}

const chips = new Map();
async function chipSvg(label) {
  if (chips.has(label)) return chips.get(label);
  const w = Math.round((58 + label.length * 9.6) * K), h = Math.round(44 * K), pad = Math.round(14 * K);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + pad * 2}" height="${h + pad * 2}">
    <defs><filter id="s" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="${4 * K}" stdDeviation="${6 * K}" flood-color="#1a1238" flood-opacity="0.35"/></filter></defs>
    <g filter="url(#s)" transform="translate(${pad} ${pad})">
      <rect width="${w}" height="${h}" rx="${10 * K}" fill="#fff" stroke="#d9d4ea" stroke-width="${1.2 * K}"/>
      <g transform="translate(${12 * K} ${9 * K}) scale(${K})">
        <path d="M2 0 H14 L22 8 V26 H2 Z" fill="#ede9fe" stroke="#7c3aed" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M14 0 V8 H22" fill="none" stroke="#7c3aed" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M6 14 H18 M6 18 H18 M6 22 H14" stroke="#7c3aed" stroke-width="1.4"/>
      </g>
      <text x="${44 * K}" y="${28 * K}" font-family="Menlo, monospace" font-size="${15 * K}" font-weight="600" fill="#2b2840">${label}</text>
    </g></svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  chips.set(label, buf);
  return buf;
}

/** camera keyframes: [frame, {x, y} in CSS px, zoom]; zoom 1 = whole window with backdrop. */
export function cameraFrom(cam) {
  return (f) => {
    let i = 0;
    while (i < cam.length - 2 && f > cam[i + 1][0]) i++;
    const [f0, c0, z0] = cam[i], [f1, c1, z1] = cam[i + 1];
    const t = smooth(clamp((f - f0) / (f1 - f0 || 1)));
    return { x: c0.x + (c1.x - c0.x) * t, y: c0.y + (c1.y - c0.y) * t, z: Math.exp(Math.log(z0) + (Math.log(z1) - Math.log(z0)) * t) };
  };
}

export async function render(dir, camera, outFile, { encode = true } = {}) {
  const { frames } = JSON.parse(fs.readFileSync(`${dir}/log.json`, 'utf8'));
  const bg = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a2550"/><stop offset="0.55" stop-color="#4b3a86"/><stop offset="1" stop-color="#c9875f"/></linearGradient>
    <radialGradient id="r" cx="0.25" cy="0.2" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#r)"/></svg>`)).png().toBuffer();
  const RADIUS = 36;
  const shadow = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}">
    <rect x="${OX}" y="${OY + 30}" width="${APP_W}" height="${APP_H}" rx="${RADIUS}" fill="#000" fill-opacity="0.45"/></svg>`)).blur(40).png().toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${APP_W}" height="${APP_H}"><rect width="${APP_W}" height="${APP_H}" rx="${RADIUS}" fill="#fff"/></svg>`);
  const base = await sharp(bg).composite([{ input: shadow }]).png().toBuffer();
  const size = Math.round(34 * K);
  const hand = await prepCursor(path.join(ROOT, '../cursors/hand.svg'), size, { x: 222, y: 36 });
  const arrow = await prepCursor(path.join(ROOT, '../cursors/arrow.svg'), size, { x: 122, y: 78 });

  const RIPPLE = 14;
  const ripples = frames.flatMap((fr, i) => (fr.event ? [{ i, x: fr.x, y: fr.y }] : []));
  const rippleSvg = (f) => {
    const cs = ripples.filter((r) => f >= r.i && f < r.i + RIPPLE).map((r) => {
      const t = (f - r.i) / RIPPLE, p = toScene(r), rad = (8 + 30 * (1 - Math.pow(1 - t, 3))) * K;
      return `<circle cx="${p.x}" cy="${p.y}" r="${rad}" fill="#7c5cff" fill-opacity="${0.18 * (1 - t)}" stroke="#7c5cff" stroke-width="${3 * K}" stroke-opacity="${0.8 * (1 - t)}"/>`;
    });
    return cs.length ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}">${cs.join('')}</svg>`) : null;
  };

  const out = `${dir}/out`;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out);
  for (let f = 0; f < frames.length; f++) {
    const fr = frames[f];
    const app = await sharp(`${dir}/${String(f).padStart(4, '0')}.png`).resize(APP_W, APP_H)
      .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    const cur = fr.hand ? hand : arrow, p = toScene(fr);
    const layers = [{ input: app, left: OX, top: OY }];
    const rip = rippleSvg(f);
    if (rip) layers.push({ input: rip });
    if (fr.carry) layers.push({ input: await chipSvg(fr.carry), left: Math.round(p.x + 14 * K), top: Math.round(p.y + 20 * K) });
    layers.push({ input: cur.buf, left: Math.round(p.x - cur.pad - cur.hot.x * cur.scale), top: Math.round(p.y - cur.pad - cur.hot.y * cur.scale) });
    const scene = await sharp(base).composite(layers).raw().toBuffer({ resolveWithObject: true });
    const c = camera(f), s = toScene(c), cw = SW / c.z, ch = SH / c.z;
    const left = Math.round(Math.min(SW - cw, Math.max(0, s.x - cw / 2)));
    const top = Math.round(Math.min(SH - ch, Math.max(0, s.y - ch / 2)));
    await sharp(scene.data, { raw: scene.info }).extract({ left, top, width: Math.round(cw), height: Math.round(ch) })
      .resize(OW, OH, { kernel: 'lanczos3' }).png({ compressionLevel: 1 }).toFile(`${out}/${String(f).padStart(4, '0')}.png`);
  }
  if (encode) encode1080(out, outFile);
  return out;
}

export function encode1080(framesDir, outFile) {
  execFileSync(ffmpeg, ['-y', '-framerate', String(FPS), '-i', `${framesDir}/%04d.png`, '-c:v', 'libx264', '-preset', 'slow',
    '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile], { stdio: 'ignore' });
  console.log('wrote', outFile, fs.readdirSync(framesDir).filter((f) => f.endsWith('.png')).length, 'frames');
}

/** Joins frame folders into one numbered sequence, with an eased dissolve of `fade` frames between each pair. */
export async function joinWithDissolve(dirs, outDir, fade = 8) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const lists = dirs.map((d) => fs.readdirSync(d).filter((f) => f.endsWith('.png')).sort().map((f) => `${d}/${f}`));
  let n = 0;
  const put = async (buf) => { await sharp(buf, { raw: { width: 1920, height: 1080, channels: 3 } }).png({ compressionLevel: 1 }).toFile(`${outDir}/${String(n++).padStart(4, '0')}.png`); };
  const raw = (f) => sharp(f).removeAlpha().resize(1920, 1080).raw().toBuffer();
  for (let i = 0; i < lists.length; i++) {
    for (const f of lists[i]) await put(await raw(f));
    if (i < lists.length - 1 && fade > 0) {
      const a = await raw(lists[i].at(-1)), b = await raw(lists[i + 1][0]);
      for (let k = 1; k <= fade; k++) {
        const t = ease(k / (fade + 1)), mix = Buffer.alloc(a.length);
        for (let j = 0; j < a.length; j++) mix[j] = a[j] + (b[j] - a[j]) * t;
        await put(mix);
      }
    }
  }
  return n;
}
