import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const APP = 'http://127.0.0.1:8123/index.html';
const EV = '/home/blackr/Work/homography/docs/spec-driven/homography-measure/evidence';
const DL = '/tmp/opencode/downloads';
fs.mkdirSync(EV, { recursive: true });
fs.mkdirSync(DL, { recursive: true });
for (const f of fs.readdirSync(DL)) fs.rmSync(`${DL}/${f}`);

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!cond) failures++;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const QUAD = [
  { x: 250, y: 150 }, { x: 1000, y: 220 }, { x: 950, y: 800 }, { x: 180, y: 720 },
];

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
});

const pageErrors = [];
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !(m.location()?.url || '').includes('favicon')) pageErrors.push(m.text());
});

const client = await page.createCDPSession();
await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

async function canvasPoint(ix, iy) {
  return page.evaluate(
    (ix, iy) => {
      const c = document.getElementById('canvas');
      const r = c.getBoundingClientRect();
      return {
        x: r.left + (ix * r.width) / c.width,
        y: r.top + (iy * r.height) / c.height,
      };
    },
    ix,
    iy
  );
}

async function clickImage(ix, iy) {
  const p = await canvasPoint(ix, iy);
  await page.evaluate((p) => {
    const c = document.getElementById('canvas');
    for (const type of ['pointerdown', 'pointerup']) {
      c.dispatchEvent(
        new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerId: 1, button: 0, isPrimary: true })
      );
    }
  }, p);
}

async function dragImage(x1, y1, x2, y2) {
  const a = await canvasPoint(x1, y1);
  const b = await canvasPoint(x2, y2);
  await page.evaluate(
    (a, b) => {
      const c = document.getElementById('canvas');
      c.dispatchEvent(new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, bubbles: true, pointerId: 2, button: 0, isPrimary: true }));
      for (let i = 1; i <= 5; i++) {
        c.dispatchEvent(new PointerEvent('pointermove', {
          clientX: a.x + ((b.x - a.x) * i) / 5,
          clientY: a.y + ((b.y - a.y) * i) / 5,
          bubbles: true, pointerId: 2, isPrimary: true,
        }));
      }
      c.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x, clientY: b.y, bubbles: true, pointerId: 2, button: 0, isPrimary: true }));
    },
    a,
    b
  );
}

const message = () => page.$eval('#message', (el) => el.textContent);
const status = () => page.$eval('#status-text', (el) => el.textContent);

// ---- generate synthetic photo: 30x20 cm graph paper under perspective ----
await page.goto(APP, { waitUntil: 'networkidle0' });
const dataUrl = await page.evaluate(async (quad) => {
  const { solveHomography4, applyHomography } = await import('http://127.0.0.1:8123/js/geometry.js');
  // genuine pinhole projection of a 30x20 cm paper rotated about its own center
  const f = 1100, cx = 600, cy = 450, tz = 120;
  const rx = (22 * Math.PI) / 180, ry = (-14 * Math.PI) / 180, rz = (6 * Math.PI) / 180;
  const K = [f, 0, cx, 0, f, cy, 0, 0, 1];
  const mul = (m, v) => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
  const cm = Math.cos, sm = Math.sin;
  const R = (() => {
    const Rx = [1, 0, 0, 0, cm(rx), -sm(rx), 0, sm(rx), cm(rx)];
    const Ry = [cm(ry), 0, sm(ry), 0, 1, 0, -sm(ry), 0, cm(ry)];
    const Rz = [cm(rz), -sm(rz), 0, sm(rz), cm(rz), 0, 0, 0, 1];
    const mm = (a, b) => {
      const o = new Array(9);
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
          o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
      return o;
    };
    return mm(Rz, mm(Ry, Rx));
  })();
  const project = (P) => {
    const rot = mul(R, [P.x - 15, P.y - 10, 0]);
    const p = mul(K, [rot[0], rot[1], rot[2] + tz]);
    return { x: p[0] / p[2], y: p[1] / p[2] };
  };
  const paperCm = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }];
  quad.length = 0;
  for (const P of paperCm) quad.push(project(P));
  const paper = [{ x: 0, y: 0 }, { x: 1500, y: 0 }, { x: 1500, y: 1000 }, { x: 0, y: 1000 }];
  const H = solveHomography4(paper, quad);
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 900;
  const g = c.getContext('2d');
  g.fillStyle = '#3a414b';
  g.fillRect(0, 0, 1200, 900);
  g.beginPath();
  g.moveTo(quad[0].x, quad[0].y);
  for (let i = 1; i < 4; i++) g.lineTo(quad[i].x, quad[i].y);
  g.closePath();
  g.fillStyle = '#f4f1e8';
  g.fill();
  g.strokeStyle = '#2b2b2b';
  const line = (p, q) => {
    const a = applyHomography(H, p);
    const b = applyHomography(H, q);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  };
  for (let i = 1; i < 10; i++) line({ x: i * 150, y: 0 }, { x: i * 150, y: 1000 });
  for (let j = 1; j < 6; j++) line({ x: 0, y: j * 200 }, { x: 1500, y: j * 200 });
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(quad[0].x, quad[0].y);
  for (let i = 1; i < 4; i++) g.lineTo(quad[i].x, quad[i].y);
  g.closePath();
  g.stroke();
  return [c.toDataURL('image/png'), quad];
}, QUAD);
const [resolvedUrl, resolvedQuad] = dataUrl;
const QUAD_SRC = resolvedQuad;
fs.writeFileSync('/tmp/opencode/test-photo.png', Buffer.from(resolvedUrl.split(',')[1], 'base64'));

// ================= AC-001: file load =================
check('AC-001 initial hint shown', (await status()).includes('No image'));
let input = await page.$('#file-input');
await input.uploadFile('/tmp/opencode/test-photo.png');
await sleep(300);
check('AC-001 image loaded via file input', (await status()).includes('Click on the image'), await status());
await page.screenshot({ path: `${EV}/01-loaded-quad.png` });

// ================= AC-002: quad placement =================
for (const p of QUAD_SRC) await clickImage(p.x, p.y);
await sleep(100);
check('AC-002 4 corners placed', (await status()).includes('Corners placed'), await status());

// ================= AC-004/010: rectify with object dims (30x20 cm) =================
await page.type('#dims-w', '30');
await page.type('#dims-h', '20');
await page.click('#btn-rectify');
await sleep(800);
const badge = await page.$eval('#aspect-badge', (el) => el.textContent);
check('AC-004 aspect method shown (vanishing points)', badge.includes('vanishing points'), badge);
const dims = await page.$eval('#canvas', (c) => ({ w: c.width, h: c.height }));
const ratio = dims.w / dims.h;
check('AC-010 rectified aspect ratio ~1.5', Math.abs(ratio - 1.5) / 1.5 < 0.03, `${dims.w}x${dims.h} ratio=${ratio.toFixed(3)}`);
check('AC-010 rectified (status updated)', (await status()).includes('Rectified'), await status());

// ================= AC-005/006: measure full width = 30 cm =================
await dragImage(0, dims.h / 2, dims.w, dims.h / 2);
await sleep(200);
let valueText = await page.$eval('#measure-list .value', (el) => el.textContent);
check('AC-006 full-width line measures 30.00 cm', valueText.replace(/\s/g, '') === '30.00cm', valueText);

// ================= AC-005: unit switch =================
await page.select('#unit-select', 'mm');
await sleep(100);
valueText = await page.$eval('#measure-list .value', (el) => el.textContent);
check('AC-005 unit switch -> 300.00 mm', valueText.replace(/\s/g, '') === '300.00mm', valueText);
await page.select('#unit-select', 'cm');
await sleep(100);

// ================= AC-008: set scale with no scale line =================
await page.select('#tool-select', 'scale');
await page.click('#btn-set-scale');
await sleep(100);
check('AC-008 set-scale without line rejected', (await message()).includes('Draw the scale line first'), await message());

// ================= AC-007: exports =================
await page.click('#btn-export-csv');
await page.click('#btn-export-png');
let files = [];
for (let i = 0; i < 50; i++) {
  await sleep(100);
  files = fs.readdirSync(DL);
  if (files.some((f) => f.endsWith('.csv')) && files.some((f) => f.endsWith('.png'))) break;
}
const csvName = files.find((f) => f.endsWith('.csv'));
const pngName = files.find((f) => f.endsWith('.png'));
check('AC-007 CSV exported', !!csvName, files.join(','));
if (csvName) {
  const csv = fs.readFileSync(`${DL}/${csvName}`, 'utf8');
  check('AC-007 CSV header', csv.startsWith('label,length_px,length,unit'), csv.split('\n')[0]);
  check('AC-007 CSV row value matches UI', /30\.0000,cm/.test(csv), csv.trim().split('\n')[1] || '');
}
check('AC-007 PNG exported', !!pngName && fs.statSync(`${DL}/${pngName}`).size > 10000,
  pngName ? `${fs.statSync(`${DL}/${pngName}`).size} bytes` : 'missing');
await page.screenshot({ path: `${EV}/02-rectified-measured.png` });

// ================= AC-001: paste from clipboard =================
const page2 = await browser.newPage();
await page2.setViewport({ width: 1500, height: 1000 });
page2.on('pageerror', (e) => pageErrors.push('page2: ' + String(e)));
await page2.goto(APP, { waitUntil: 'networkidle0' });
await page2.evaluate(async (url) => {
  const blob = await (await fetch(url)).blob();
  const file = new File([blob], 'pasted.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
}, resolvedUrl);
await sleep(400);
check('AC-001 image loaded via paste', (await page2.$eval('#status-text', (el) => el.textContent)).includes('Click on the image'));

// ================= AC-008: non-image file =================
fs.writeFileSync('/tmp/opencode/not-image.txt', 'hello');
input = await page2.$('#file-input');
await input.uploadFile('/tmp/opencode/not-image.txt');
await sleep(200);
check('AC-008 non-image rejected with message', (await page2.$eval('#message', (el) => el.textContent)).includes('Not an image'));

// ================= AC-008: collinear quad =================
await page2.evaluate(() => document.getElementById('btn-reset').click());
await sleep(100);
for (let i = 0; i < 4; i++) {
  const p = await page2.evaluate((t) => {
    const c = document.getElementById('canvas');
    const r = c.getBoundingClientRect();
    return { x: r.left + t * r.width, y: r.top + t * r.height };
  }, 0.2 + i * 0.2);
  await page2.evaluate((p) => {
    const c = document.getElementById('canvas');
    for (const type of ['pointerdown', 'pointerup']) {
      c.dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerId: 1, button: 0, isPrimary: true }));
    }
  }, p);
}
await page2.click('#btn-rectify');
await sleep(200);
check('AC-008 collinear quad rejected', (await page2.$eval('#message', (el) => el.textContent)).includes('invalid'),
  await page2.$eval('#message', (el) => el.textContent));

await page.screenshot({ path: `${EV}/03-degenerate-rejected.png` });

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
console.log(failures === 0 ? '\nALL E2E CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
