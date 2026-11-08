export const UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4 };

export function toMm(value, unit) {
  if (!(unit in UNITS)) throw new Error(`unknown unit: ${unit}`);
  return value * UNITS[unit];
}

export function fromMm(mm, unit) {
  if (!(unit in UNITS)) throw new Error(`unknown unit: ${unit}`);
  return mm / UNITS[unit];
}

export function lineLengthPx(line) {
  return Math.hypot(line.p2.x - line.p1.x, line.p2.y - line.p1.y);
}

export class Calibration {
  constructor() {
    this.pxPerMm = null;
    this.source = null;
  }

  get isSet() {
    return this.pxPerMm !== null;
  }

  set(pixelLength, realLength, unit) {
    if (!(pixelLength > 0) || !(realLength > 0)) {
      throw new Error('calibration requires positive pixel and real lengths');
    }
    if (!(unit in UNITS)) throw new Error(`unknown unit: ${unit}`);
    this.pxPerMm = pixelLength / toMm(realLength, unit);
    this.source = { pixelLength, realLength, unit };
  }

  clear() {
    this.pxPerMm = null;
    this.source = null;
  }

  pxToMm(pxLength) {
    return this.isSet ? pxLength / this.pxPerMm : null;
  }

  pxToUnit(pxLength, unit) {
    const mm = this.pxToMm(pxLength);
    return mm === null ? null : fromMm(mm, unit);
  }
}

export function formatValue(value, unit, digits = 2) {
  if (value === null || !isFinite(value)) return '—';
  return `${value.toFixed(digits)} ${unit}`;
}

export function exportCSV(lines, calibration, unit) {
  const rows = ['label,length_px,length,unit'];
  for (const line of lines) {
    const px = lineLengthPx(line);
    const real = calibration.pxToUnit(px, unit);
    const label = String(line.label ?? '').replaceAll('"', '""');
    rows.push(
      `"${label}",${px.toFixed(2)},${real === null ? '' : real.toFixed(4)},${unit}`
    );
  }
  return rows.join('\n') + '\n';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function exportPNG(rectCanvas, lines, calibration, unit) {
  const out = document.createElement('canvas');
  out.width = rectCanvas.width;
  out.height = rectCanvas.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(rectCanvas, 0, 0);

  for (const line of lines) {
    const px = lineLengthPx(line);
    const real = calibration.pxToUnit(px, unit);
    const label = real === null
      ? `${line.label} (${px.toFixed(1)} px)`
      : `${line.label} (${formatValue(real, unit)})`;

    ctx.lineWidth = Math.max(2, out.width / 400);
    ctx.strokeStyle = '#00e5ff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(line.p1.x, line.p1.y);
    ctx.lineTo(line.p2.x, line.p2.y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const r = Math.max(4, out.width / 120);
    ctx.fillStyle = '#ffea00';
    for (const p of [line.p1, line.p2]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const mx = (line.p1.x + line.p2.x) / 2;
    const my = (line.p1.y + line.p2.y) / 2;
    const fontPx = Math.max(12, out.width / 30);
    ctx.font = `bold ${fontPx}px sans-serif`;
    const tw = ctx.measureText(label).width;
    const pad = fontPx * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(mx - tw / 2 - pad, my - fontPx - pad, tw + pad * 2, fontPx + pad * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, mx - tw / 2, my - pad);
  }

  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}
