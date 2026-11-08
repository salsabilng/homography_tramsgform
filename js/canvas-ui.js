export function pointerToCanvas(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * canvas.width) / rect.width,
    y: ((e.clientY - rect.top) * canvas.height) / rect.height,
  };
}

function apparentSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  return rect.width > 0 ? canvas.width / rect.width : 1;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export class QuadEditor {
  constructor(canvas, onChange = () => {}) {
    this.canvas = canvas;
    this.onChange = onChange;
    this.corners = [];
    this.dragIndex = -1;
    this.enabled = false;
    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
  }

  reset() {
    this.corners = [];
    this.dragIndex = -1;
    this.onChange();
  }

  get complete() {
    return this.corners.length === 4;
  }

  get quad() {
    return this.corners.map((p) => ({ x: p.x, y: p.y }));
  }

  draw(ctx) {
    const pts = this.corners;
    if (pts.length === 0) return;
    const s = apparentSize(this.canvas);
    ctx.save();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#00e5ff';
    ctx.fillStyle = '#ffea00';
    if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (pts.length === 4) ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,229,255,0.12)';
      ctx.fill();
    }
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#ffea00';
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.stroke();
    }
    ctx.restore();
  }

  _hit(pt) {
    const r = 12 * apparentSize(this.canvas);
    for (let i = 0; i < this.corners.length; i++) {
      if (Math.hypot(pt.x - this.corners[i].x, pt.y - this.corners[i].y) <= r) return i;
    }
    return -1;
  }

  _clamp(p) {
    return {
      x: Math.max(0, Math.min(this.canvas.width, p.x)),
      y: Math.max(0, Math.min(this.canvas.height, p.y)),
    };
  }

  _down(e) {
    if (!this.enabled) return;
    const pt = pointerToCanvas(this.canvas, e);
    const hit = this._hit(pt);
    if (hit >= 0) {
      this.dragIndex = hit;
    } else if (this.corners.length < 4) {
      this.corners.push(this._clamp(pt));
      this.onChange();
    }
    if (this.dragIndex >= 0) {
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {}
    }
  }

  _move(e) {
    if (!this.enabled || this.dragIndex < 0) return;
    this.corners[this.dragIndex] = this._clamp(pointerToCanvas(this.canvas, e));
    this.onChange();
  }

  _up(e) {
    if (!this.enabled) return;
    if (this.dragIndex >= 0) {
      this.dragIndex = -1;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {}
    }
  }
}

export class LineLayer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.onChange = opts.onChange || (() => {});
    this.maxLines = opts.maxLines ?? Infinity;
    this.labelPrefix = opts.labelPrefix || 'Line';
    this.color = opts.color || '#00e5ff';
    this.lines = [];
    this.selectedId = null;
    this.enabled = false;
    this._nextId = 1;
    this._preview = null;
    this._drag = null;
    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
  }

  clear() {
    this.lines = [];
    this.selectedId = null;
    this._preview = null;
    this._drag = null;
    this.onChange();
  }

  addLine(p1, p2, label = null) {
    if (this.lines.length >= this.maxLines) {
      const removed = this.lines.shift();
      if (removed && this.selectedId === removed.id) this.selectedId = null;
    }
    const line = {
      id: this._nextId++,
      p1: { x: p1.x, y: p1.y },
      p2: { x: p2.x, y: p2.y },
      label: label ?? `${this.labelPrefix} ${this._nextId - 1}`,
    };
    this.lines.push(line);
    this.selectedId = line.id;
    this.onChange();
    return line;
  }

  deleteLine(id) {
    this.lines = this.lines.filter((l) => l.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.onChange();
  }

  draw(ctx) {
    const s = apparentSize(this.canvas);
    const drawLine = (line, color, width) => {
      ctx.save();
      ctx.lineWidth = width * s;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(line.p1.x, line.p1.y);
      ctx.lineTo(line.p2.x, line.p2.y);
      ctx.stroke();
      for (const p of [line.p1, line.p2]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#ffea00';
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1 * s;
        ctx.stroke();
      }
      const mx = (line.p1.x + line.p2.x) / 2;
      const my = (line.p1.y + line.p2.y) / 2;
      ctx.font = `bold ${11 * s}px sans-serif`;
      const text = line.label;
      const tw = ctx.measureText(text).width;
      const pad = 3 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(mx - tw / 2 - pad, my - 14 * s - pad, tw + pad * 2, 14 * s + pad * 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, mx - tw / 2, my - 4 * s);
      ctx.restore();
    };
    for (const line of this.lines) {
      drawLine(line, line.id === this.selectedId ? '#ffea00' : this.color, 2);
    }
    if (this._preview) {
      ctx.save();
      ctx.setLineDash([6 * s, 4 * s]);
      drawLine(this._preview, this.color, 1.5);
      ctx.restore();
    }
  }

  _hit(pt) {
    const r = 12 * apparentSize(this.canvas);
    for (const line of this.lines) {
      if (Math.hypot(pt.x - line.p1.x, pt.y - line.p1.y) <= r) return { type: 'p1', line };
      if (Math.hypot(pt.x - line.p2.x, pt.y - line.p2.y) <= r) return { type: 'p2', line };
    }
    for (const line of this.lines) {
      if (distToSegment(pt, line.p1, line.p2) <= r) return { type: 'body', line };
    }
    return null;
  }

  _down(e) {
    if (!this.enabled) return;
    const pt = pointerToCanvas(this.canvas, e);
    const hit = this._hit(pt);
    if (hit) {
      this.selectedId = hit.line.id;
      this._drag = { type: hit.type, id: hit.line.id, last: pt };
    } else {
      this._preview = {
        id: -1,
        p1: { x: pt.x, y: pt.y },
        p2: { x: pt.x, y: pt.y },
        label: this.labelPrefix,
      };
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {}
    this.onChange();
  }

  _move(e) {
    if (!this.enabled) return;
    const pt = pointerToCanvas(this.canvas, e);
    if (this._drag) {
      const line = this.lines.find((l) => l.id === this._drag.id);
      if (line) {
        if (this._drag.type === 'body') {
          const dx = pt.x - this._drag.last.x;
          const dy = pt.y - this._drag.last.y;
          line.p1.x += dx;
          line.p2.x += dx;
          line.p1.y += dy;
          line.p2.y += dy;
          this._drag.last = pt;
        } else {
          line[this._drag.type] = { x: pt.x, y: pt.y };
        }
        this.onChange();
      }
    } else if (this._preview) {
      this._preview.p2 = { x: pt.x, y: pt.y };
      this.onChange();
    }
  }

  _up(e) {
    if (!this.enabled) return;
    if (this._preview) {
      const { p1, p2 } = this._preview;
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 3) this.addLine(p1, p2);
      this._preview = null;
      this.onChange();
    }
    this._drag = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {}
  }
}
