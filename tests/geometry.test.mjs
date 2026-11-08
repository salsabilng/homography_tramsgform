import test from 'node:test';
import assert from 'node:assert/strict';
import {
  solveHomography4,
  applyHomography,
  computeVanishingPoints,
  solveFocalFromVanishingPoints,
  metricAspectFromQuad,
  determineAspect,
  orderQuad,
  isConvexQuad,
} from '../js/geometry.js';

const K = (f, cx, cy) => [f, 0, cx, 0, f, cy, 0, 0, 1];

function matVec(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function rotXYZ(rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  const mul = (a, b) => {
    const out = new Array(9);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return out;
  };
  return mul(Rz, mul(Ry, Rx));
}

function projectRect({ W, H, f, cx, cy, rx, ry, rz, tx = 0, ty = 0, tz }) {
  const Kmat = K(f, cx, cy);
  const R = rotXYZ(rx, ry, rz);
  const corners = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  return corners.map((P) => {
    const X = [P.x + tx, P.y + ty, tz];
    const Rc = matVec(R, X);
    const p = matVec(Kmat, Rc);
    return { x: p[0] / p[2], y: p[1] / p[2] };
  });
}

const SYN = {
  W: 30,
  H: 20,
  f: 1400,
  cx: 600,
  cy: 400,
  rx: (28 * Math.PI) / 180,
  ry: (-16 * Math.PI) / 180,
  rz: (7 * Math.PI) / 180,
  tz: 90,
};

test('solveHomography4 maps the four source points exactly', () => {
  const src = [{ x: 12, y: 34 }, { x: 200, y: 10 }, { x: 310, y: 250 }, { x: 5, y: 190 }];
  const dst = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 260 }, { x: 0, y: 260 }];
  const h = solveHomography4(src, dst);
  for (let i = 0; i < 4; i++) {
    const p = applyHomography(h, src[i]);
    assert.ok(Math.abs(p.x - dst[i].x) < 1e-6, `x err ${p.x - dst[i].x}`);
    assert.ok(Math.abs(p.y - dst[i].y) < 1e-6, `y err ${p.y - dst[i].y}`);
  }
});

test('solveHomography4 throws on degenerate correspondences', () => {
  const src = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
  const dst = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  assert.throws(() => solveHomography4(src, dst));
});

test('orderQuad returns TL,TR,BR,BL regardless of input order', () => {
  const quad = [{ x: 10, y: 8 }, { x: 90, y: 12 }, { x: 96, y: 70 }, { x: 6, y: 66 }];
  for (const perm of [
    [0, 1, 2, 3], [1, 2, 3, 0], [2, 3, 0, 1], [3, 2, 1, 0], [0, 3, 2, 1], [1, 0, 3, 2],
  ]) {
    const shuffled = perm.map((i) => quad[i]);
    const ordered = orderQuad(shuffled);
    assert.equal(ordered[0].x, 10);
    assert.equal(ordered[1].x, 90);
    assert.equal(ordered[2].x, 96);
    assert.equal(ordered[3].x, 6);
    assert.ok(isConvexQuad(ordered));
  }
});

test('isConvexQuad rejects concave, bowtie and collinear quads', () => {
  assert.ok(isConvexQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]));
  const concave = orderQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 10 }]);
  assert.equal(isConvexQuad(concave), false);
  const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  assert.equal(isConvexQuad(bowtie), false);
  const collinear = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
  assert.equal(isConvexQuad(collinear), false);
});

test('solveFocalFromVanishingPoints recovers the true focal length', () => {
  const quad = projectRect(SYN);
  const { v1, v2 } = computeVanishingPoints(quad);
  const f = solveFocalFromVanishingPoints(v1, v2, SYN.cx, SYN.cy);
  assert.ok(f !== null, 'focal solve failed');
  assert.ok(Math.abs(f - SYN.f) / SYN.f < 0.05, `f=${f} vs ${SYN.f}`);
});

test('solveFocalFromVanishingPoints returns null when both VPs are at infinity', () => {
  const quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
  const { v1, v2 } = computeVanishingPoints(quad);
  assert.equal(solveFocalFromVanishingPoints(v1, v2, 50, 30), null);
});

test('metricAspectFromQuad recovers the true rectangle aspect from known focal', () => {
  const quad = projectRect(SYN);
  const m = metricAspectFromQuad(quad, SYN.f, SYN.cx, SYN.cy);
  assert.ok(m !== null, 'metric aspect failed');
  const trueAspect = SYN.W / SYN.H;
  assert.ok(
    Math.abs(m.aspect - trueAspect) / trueAspect < 0.02,
    `aspect=${m.aspect} vs ${trueAspect}`
  );
});

test('determineAspect chain: exif method recovers aspect and reports method', () => {
  const quad = projectRect(SYN);
  const f35 = (SYN.f * 36) / (2 * SYN.cx);
  const r = determineAspect(quad, {
    imageWidth: 2 * SYN.cx,
    imageHeight: 2 * SYN.cy,
    exifFocal35mm: f35,
  });
  assert.equal(r.method, 'exif');
  const trueAspect = SYN.W / SYN.H;
  assert.ok(Math.abs(r.aspect - trueAspect) / trueAspect < 0.02);
});

test('determineAspect chain: vanishing-points method recovers aspect without EXIF', () => {
  const quad = projectRect(SYN);
  const r = determineAspect(quad, {
    imageWidth: 2 * SYN.cx,
    imageHeight: 2 * SYN.cy,
    exifFocal35mm: null,
  });
  assert.equal(r.method, 'vanishing-points');
  assert.ok(Math.abs(r.f - SYN.f) / SYN.f < 0.05, `f=${r.f}`);
  const trueAspect = SYN.W / SYN.H;
  assert.ok(Math.abs(r.aspect - trueAspect) / trueAspect < 0.02);
});

test('determineAspect chain: user-dims fallback used when focal solve degenerate', () => {
  const quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
  const r = determineAspect(quad, {
    imageWidth: 200,
    imageHeight: 120,
    userWidth: 29.7,
    userHeight: 21,
  });
  assert.equal(r.method, 'user-dims');
  assert.ok(Math.abs(r.aspect - 29.7 / 21) < 1e-12);
});

test('determineAspect chain: heuristic fallback when nothing else applies', () => {
  const quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
  const r = determineAspect(quad, { imageWidth: 200, imageHeight: 120 });
  assert.equal(r.method, 'heuristic');
  assert.ok(Math.abs(r.aspect - 100 / 60) < 1e-12);
});

test('determineAspect never throws on garbage input', () => {
  const quad = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
  const r = determineAspect(quad, { imageWidth: 100, imageHeight: 100 });
  assert.ok(r.aspect === null || isFinite(r.aspect));
});
