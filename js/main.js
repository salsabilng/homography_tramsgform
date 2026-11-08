import { orderQuad, isConvexQuad, determineAspect } from './geometry.js';
import { rectifyQuad } from './warp.js';
import { readFocalLengthIn35mm } from './exif.js';
import {
  Calibration,
  lineLengthPx,
  exportCSV,
  exportPNG,
  downloadBlob,
  formatValue,
} from './measure.js';
import { QuadEditor, LineLayer } from './canvas-ui.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

const state = {
  stage: 'empty',
  srcCanvas: null,
  srcImageData: null,
  exifFocal35mm: null,
  aspectInfo: null,
  rectCanvas: null,
  calibration: new Calibration(),
  unit: 'cm',
  tool: 'measure',
  fileName: 'image',
  measureCounter: 0,
};

const quadEditor = new QuadEditor(canvas, render);
const scaleLayer = new LineLayer(canvas, {
  onChange: render,
  maxLines: 1,
  labelPrefix: 'Scale',
  color: '#ffb300',
});
const measureLayer = new LineLayer(canvas, {
  onChange: () => {
    render();
    rebuildMeasureList();
  },
  labelPrefix: 'Measurement',
});

function showMessage(text, kind = '') {
  const el = $('message');
  el.textContent = text;
  el.className = kind;
  clearTimeout(showMessage._t);
  if (text) showMessage._t = setTimeout(() => { el.textContent = ''; el.className = ''; }, 6000);
}

function allLines() {
  return [...scaleLayer.lines, ...measureLayer.lines];
}

function setStage(stage) {
  state.stage = stage;
  quadEditor.enabled = stage === 'quad';
  scaleLayer.enabled = stage === 'rectified' && state.tool === 'scale';
  measureLayer.enabled = stage === 'rectified' && state.tool === 'measure';
  $('btn-rectify').disabled = stage === 'empty';
  $('btn-edit-corners').disabled = stage !== 'rectified';
  $('btn-reset').disabled = stage === 'empty';
  $('btn-export-png').disabled = stage !== 'rectified';
  $('btn-export-csv').disabled = stage !== 'rectified';
  render();
}

function render() {
  const base = state.stage === 'rectified' ? state.rectCanvas : state.srcCanvas;
  if (!base) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    $('hint').classList.remove('hidden');
    updateStatus();
    return;
  }
  $('hint').classList.add('hidden');
  if (canvas.width !== base.width || canvas.height !== base.height) {
    canvas.width = base.width;
    canvas.height = base.height;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0d1015';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base, 0, 0);
  const stageRect = $('stage').getBoundingClientRect();
  const s = Math.min((stageRect.width - 16) / base.width, (stageRect.height - 16) / base.height);
  canvas.style.width = `${Math.round(base.width * s)}px`;
  canvas.style.height = `${Math.round(base.height * s)}px`;
  if (state.stage === 'quad') quadEditor.draw(ctx);
  if (state.stage === 'rectified') {
    scaleLayer.draw(ctx);
    measureLayer.draw(ctx);
  }
  updateStatus();
}

function updateStatus() {
  const st = $('status-text');
  const badge = $('aspect-badge');
  if (state.stage === 'empty') {
    st.textContent = 'No image loaded.';
    badge.classList.add('hidden');
    return;
  }
  if (state.stage === 'quad') {
    st.textContent = quadEditor.complete
      ? 'Corners placed — drag to adjust, then Rectify.'
      : `Click on the image to place corners (${quadEditor.corners.length}/4).`;
    badge.classList.add('hidden');
    return;
  }
  st.textContent = 'Rectified. Set a scale line, then draw measurement lines.';
  if (state.aspectInfo) {
    const names = {
      'exif': 'aspect: EXIF focal length',
      'vanishing-points': 'aspect: vanishing points',
      'user-dims': 'aspect: user dimensions',
      'heuristic': 'aspect: heuristic (mean sides)',
    };
    let text = names[state.aspectInfo.method] || state.aspectInfo.method;
    if (state.aspectInfo.f) text += ` · f≈${Math.round(state.aspectInfo.f)} px`;
    text += ` · ratio ${state.aspectInfo.aspect.toFixed(3)}`;
    badge.textContent = text;
    badge.classList.remove('hidden');
  }
  const cal = state.calibration;
  if (cal.isSet) {
    $('scale-status').textContent =
      `Calibrated: ${cal.pxPerMm.toFixed(3)} px/mm (from ${cal.source.pixelLength.toFixed(1)} px = ` +
      `${cal.source.realLength} ${cal.source.unit}).`;
  } else {
    $('scale-status').textContent =
      'Not calibrated. Select the “Scale line” tool, draw a line on a known length, then set its real length below.';
  }
}

function rebuildMeasureList() {
  const ul = $('measure-list');
  ul.textContent = '';
  for (const line of measureLayer.lines) {
    const li = document.createElement('li');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = line.label;
    input.addEventListener('change', () => {
      line.label = input.value || line.label;
      render();
    });
    const value = document.createElement('span');
    value.className = 'value';
    const px = lineLengthPx(line);
    const real = state.calibration.pxToUnit(px, state.unit);
    value.textContent = real === null
      ? `${px.toFixed(1)} px`
      : formatValue(real, state.unit);
    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Delete line';
    del.textContent = '×';
    del.addEventListener('click', () => {
      measureLayer.deleteLine(line.id);
      rebuildMeasureList();
    });
    li.append(input, value, del);
    ul.appendChild(li);
  }
}

async function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showMessage('Not an image file.', 'error');
    return;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const MAX = 4096;
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    src.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    state.srcCanvas = src;
    state.srcImageData = src.getContext('2d').getImageData(0, 0, w, h);
    state.exifFocal35mm = await readFocalLengthIn35mm(file);
    state.aspectInfo = null;
    state.rectCanvas = null;
    state.fileName = file.name ? file.name.replace(/\.[^.]+$/, '') : 'image';
    state.calibration.clear();
    state.measureCounter = 0;
    quadEditor.reset();
    scaleLayer.clear();
    measureLayer.clear();
    rebuildMeasureList();
    setStage('quad');
    if (scale < 1) showMessage(`Large image downscaled to ${w}×${h} px.`, 'ok');
    else showMessage(`Loaded ${file.name || 'image'} (${w}×${h}).`, 'ok');
  } catch (err) {
    console.error(err);
    showMessage('Could not load that image.', 'error');
  }
}

function rectify() {
  if (state.stage === 'empty') return;
  if (!quadEditor.complete) {
    showMessage('Place all 4 corners first.', 'error');
    return;
  }
  const quad = orderQuad(quadEditor.quad);
  if (!isConvexQuad(quad)) {
    showMessage('The corners form an invalid (self-intersecting or flat) shape.', 'error');
    return;
  }
  const userWidth = parseFloat($('dims-w').value) || null;
  const userHeight = parseFloat($('dims-h').value) || null;
  const dimsUnit = $('dims-unit').value;

  const aspectInfo = determineAspect(quad, {
    imageWidth: state.srcCanvas.width,
    imageHeight: state.srcCanvas.height,
    exifFocal35mm: state.exifFocal35mm,
    userWidth: userWidth && userHeight ? userWidth : null,
    userHeight: userWidth && userHeight ? userHeight : null,
  });

  const meanV = (lineLengthPx({ p1: quad[1], p2: quad[2] }) +
    lineLengthPx({ p1: quad[0], p2: quad[3] })) / 2;
  let outH = Math.round(Math.max(256, Math.min(2048, meanV)));
  let outW = Math.round(outH * aspectInfo.aspect);
  if (outW > 2048) {
    outW = 2048;
    outH = Math.max(256, Math.round(2048 / aspectInfo.aspect));
  }
  if (outH > 2048) {
    outH = 2048;
    outW = Math.max(256, Math.round(2048 * aspectInfo.aspect));
  }

  try {
    const { canvas: rectCanvas } = rectifyQuad(state.srcImageData, quad, outW, outH);
    state.rectCanvas = rectCanvas;
    state.aspectInfo = aspectInfo;
    state.calibration.clear();
    scaleLayer.clear();
    measureLayer.clear();
    if (userWidth > 0 && userHeight > 0) {
      state.calibration.set(outW, userWidth, dimsUnit);
    }
    rebuildMeasureList();
    setStage('rectified');
    showMessage(
      `Rectified to ${outW}×${outH} px using ${aspectInfo.method}. ` +
      (state.calibration.isSet ? 'Scale set from object dimensions.' : 'Now set the scale.'),
      'ok'
    );
  } catch (err) {
    console.error(err);
    showMessage(`Rectify failed: ${err.message || err}`, 'error');
  }
}

$('file-input').addEventListener('change', (e) => {
  if (e.target.files[0]) loadImageFile(e.target.files[0]);
  e.target.value = '';
});

$('btn-paste').addEventListener('click', async () => {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) {
        const blob = await item.getType(type);
        return loadImageFile(new File([blob], 'clipboard', { type }));
      }
    }
    showMessage('No image in clipboard — press Ctrl+V instead.', 'error');
  } catch {
    showMessage('Clipboard access denied — press Ctrl+V to paste.', 'error');
  }
});

window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items || [];
  for (const it of items) {
    if (it.type.startsWith('image/')) {
      const file = it.getAsFile();
      if (file) return loadImageFile(file);
    }
  }
});

$('stage').addEventListener('dragover', (e) => e.preventDefault());
$('stage').addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) loadImageFile(file);
});

$('btn-rectify').addEventListener('click', rectify);
$('btn-edit-corners').addEventListener('click', () => setStage('quad'));
$('btn-reset').addEventListener('click', () => {
  quadEditor.reset();
  scaleLayer.clear();
  measureLayer.clear();
  state.calibration.clear();
  state.aspectInfo = null;
  state.rectCanvas = null;
  rebuildMeasureList();
  setStage('quad');
  showMessage('Corners, lines and scale cleared.');
});

$('tool-select').addEventListener('change', (e) => {
  state.tool = e.target.value;
  setStage(state.stage);
});

$('unit-select').addEventListener('change', (e) => {
  state.unit = e.target.value;
  rebuildMeasureList();
  render();
});

$('btn-set-scale').addEventListener('click', () => {
  const line = scaleLayer.lines[0];
  if (!line) {
    showMessage('Draw the scale line first (Tool → Scale line).', 'error');
    return;
  }
  const value = parseFloat($('scale-length').value);
  if (!(value > 0)) {
    showMessage('Enter the real length of the scale line.', 'error');
    return;
  }
  try {
    state.calibration.set(lineLengthPx(line), value, $('scale-unit').value);
    rebuildMeasureList();
    render();
    showMessage('Scale updated. Measurements now show real units.', 'ok');
  } catch (err) {
    showMessage(String(err.message || err), 'error');
  }
});

$('btn-clear-scale').addEventListener('click', () => {
  state.calibration.clear();
  render();
  rebuildMeasureList();
});

$('btn-export-png').addEventListener('click', async () => {
  if (!state.rectCanvas) return;
  const blob = await exportPNG(state.rectCanvas, allLines(), state.calibration, state.unit);
  downloadBlob(blob, `${state.fileName}-rectified.png`);
  showMessage('PNG exported.', 'ok');
});

$('btn-export-csv').addEventListener('click', () => {
  if (!state.rectCanvas) return;
  const blob = new Blob([exportCSV(allLines(), state.calibration, state.unit)], {
    type: 'text/csv',
  });
  downloadBlob(blob, `${state.fileName}-measurements.csv`);
  showMessage('CSV exported.', 'ok');
});

window.addEventListener('resize', render);

setStage('empty');
