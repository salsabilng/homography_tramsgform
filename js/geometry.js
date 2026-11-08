export function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function lineThrough(p1, p2) {
  return cross3([p1.x, p1.y, 1], [p2.x, p2.y, 1]);
}

export function intersectLines(l1, l2) {
  return cross3(l1, l2);
}

export function norm3(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

export function normalize3(v) {
  const n = norm3(v);
  if (!isFinite(n) || n === 0) return [v[0], v[1], v[2]];
  return [v[0] / n, v[1] / n, v[2] / n];
}

export function mat3Mul(a, b) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] =
        a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

export function mat3Transpose(a) {
  return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
}

export function mat3Det(a) {
  return (
    a[0] * (a[4] * a[8] - a[5] * a[7]) -
    a[1] * (a[3] * a[8] - a[5] * a[6]) +
    a[2] * (a[3] * a[7] - a[4] * a[6])
  );
}

export function mat3Inverse(a) {
  const det = mat3Det(a);
  if (!isFinite(det) || Math.abs(det) < 1e-300) return null;
  const inv = [
    (a[4] * a[8] - a[5] * a[7]) / det,
    (a[2] * a[7] - a[1] * a[8]) / det,
    (a[1] * a[5] - a[2] * a[4]) / det,
    (a[5] * a[6] - a[3] * a[8]) / det,
    (a[0] * a[8] - a[2] * a[6]) / det,
    (a[2] * a[3] - a[0] * a[5]) / det,
    (a[3] * a[7] - a[4] * a[6]) / det,
    (a[1] * a[6] - a[0] * a[7]) / det,
    (a[0] * a[4] - a[1] * a[3]) / det,
  ];
  return inv;
}

export function applyHomography(h, p) {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

export function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function edgeCross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function isConvexQuad(quad) {
  if (!Array.isArray(quad) || quad.length !== 4) return false;
  let sign = 0;
  let meanLen = 0;
  for (let i = 0; i < 4; i++) {
    meanLen += dist2D(quad[i], quad[(i + 1) % 4]);
  }
  meanLen /= 4;
  if (!(meanLen > 0)) return false;
  const eps = 1e-6 * meanLen * meanLen;
  for (let i = 0; i < 4; i++) {
    const c = edgeCross(quad[i], quad[(i + 1) % 4], quad[(i + 2) % 4]);
    if (Math.abs(c) <= eps) return false;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export function orderQuad(quad) {
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  const pts = quad
    .map((p, i) => ({ p, i, a: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((u, v) => u.a - v.a)
    .map((e) => ({ x: e.p.x, y: e.p.y }));
  let best = 0;
  let bestScore = Infinity;
  for (let r = 0; r < 4; r++) {
    const a = pts[r];
    const b = pts[(r + 1) % 4];
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dx < dy) continue;
    const score = a.y * 2 + a.x;
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return [0, 1, 2, 3].map((k) => pts[(best + k) % 4]);
}

export function solveHomography4(src, dst) {
  const m = [];
  const rhs = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error('degenerate correspondence set');
    if (pivot !== col) {
      [m[col], m[pivot]] = [m[pivot], m[col]];
      [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    }
    const pv = m[col][col];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = m[r][col] / pv;
      if (f === 0) continue;
      for (let c = col; c < 8; c++) m[r][c] -= f * m[col][c];
      rhs[r] -= f * rhs[col];
    }
  }
  const h = [];
  for (let i = 0; i < 8; i++) h.push(rhs[i] / m[i][i]);
  h.push(1);
  return h;
}

export function computeVanishingPoints(quad) {
  const [p0, p1, p2, p3] = quad;
  const v1 = normalize3(intersectLines(lineThrough(p0, p1), lineThrough(p3, p2)));
  const v2 = normalize3(intersectLines(lineThrough(p0, p3), lineThrough(p1, p2)));
  return { v1, v2 };
}

export function solveFocalFromVanishingPoints(v1, v2, cx, cy) {
  const z1 = v1[2];
  const z2 = v2[2];
  if (Math.abs(z1) < 1e-12 || Math.abs(z2) < 1e-12) return null;
  const t =
    v1[0] * v2[0] +
    v1[1] * v2[1] -
    cx * (v1[0] * z2 + z1 * v2[0]) -
    cy * (v1[1] * z2 + z1 * v2[1]) +
    (cx * cx + cy * cy) * z1 * z2;
  const f2 = -t / (z1 * z2);
  if (!isFinite(f2) || f2 <= 0) return null;
  return Math.sqrt(f2);
}

export function cholesky3(w) {
  if (w[0] <= 0) return null;
  const l00 = Math.sqrt(w[0]);
  const l10 = w[3] / l00;
  const l20 = w[6] / l00;
  const d11 = w[4] - l10 * l10;
  if (d11 <= 0) return null;
  const l11 = Math.sqrt(d11);
  const l21 = (w[7] - l20 * l10) / l11;
  const d22 = w[8] - l20 * l20 - l21 * l21;
  if (d22 <= 0) return null;
  const l22 = Math.sqrt(d22);
  return [l00, 0, 0, l10, l11, 0, l20, l21, l22];
}

export function metricAspectFromQuad(quad, f, cx, cy) {
  const { v1, v2 } = computeVanishingPoints(quad);
  const lInf = normalize3(cross3(v1, v2));
  if (!isFinite(lInf[0]) || Math.abs(lInf[2]) < 1e-12) return null;
  const hA = [1, 0, 0, 0, 1, 0, lInf[0], lInf[1], lInf[2]];
  const hAinv = mat3Inverse(hA);
  if (hAinv === null) return null;
  const f2 = f * f;
  const omega = [
    1 / f2, 0, -cx / f2,
    0, 1 / f2, -cy / f2,
    -cx / f2, -cy / f2, (cx * cx + cy * cy) / f2 + 1,
  ];
  const omegaPrime = mat3Mul(mat3Mul(mat3Transpose(hAinv), omega), hAinv);
  const l = cholesky3(omegaPrime);
  if (l === null) return null;
  const hM = mat3Transpose(l);
  const h = mat3Mul(hM, hA);
  const q = quad.map((p) => applyHomography(h, p));
  const width = (dist2D(q[0], q[1]) + dist2D(q[3], q[2])) / 2;
  const height = (dist2D(q[1], q[2]) + dist2D(q[0], q[3])) / 2;
  if (!(width > 0) || !(height > 0) || !isFinite(width) || !isFinite(height)) {
    return null;
  }
  return { aspect: width / height, width, height };
}

export function determineAspect(quad, opts = {}) {
  const {
    imageWidth = 0,
    imageHeight = 0,
    exifFocal35mm = null,
    userWidth = null,
    userHeight = null,
  } = opts;
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;

  if (exifFocal35mm && imageWidth > 0) {
    const f = (exifFocal35mm / 36) * imageWidth;
    const m = metricAspectFromQuad(quad, f, cx, cy);
    if (m) return { aspect: m.aspect, method: 'exif', f, width: m.width, height: m.height };
  }

  const { v1, v2 } = computeVanishingPoints(quad);
  const fVp = solveFocalFromVanishingPoints(v1, v2, cx, cy);
  if (fVp !== null) {
    const m = metricAspectFromQuad(quad, fVp, cx, cy);
    if (m) {
      return { aspect: m.aspect, method: 'vanishing-points', f: fVp, width: m.width, height: m.height };
    }
  }

  if (userWidth > 0 && userHeight > 0) {
    return { aspect: userWidth / userHeight, method: 'user-dims', f: null, width: null, height: null };
  }

  const width = (dist2D(quad[0], quad[1]) + dist2D(quad[3], quad[2])) / 2;
  const height = (dist2D(quad[1], quad[2]) + dist2D(quad[0], quad[3])) / 2;
  return {
    aspect: height > 0 ? width / height : 1,
    method: 'heuristic',
    f: null,
    width,
    height,
  };
}
