import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNITS,
  toMm,
  fromMm,
  Calibration,
  lineLengthPx,
  exportCSV,
} from '../js/measure.js';

test('unit conversions round-trip', () => {
  assert.equal(toMm(5, 'cm'), 50);
  assert.equal(toMm(1, 'm'), 1000);
  assert.equal(toMm(1, 'in'), 25.4);
  assert.equal(fromMm(50, 'cm'), 5);
  for (const unit of Object.keys(UNITS)) {
    assert.ok(Math.abs(fromMm(toMm(3.7, unit), unit) - 3.7) < 1e-12);
  }
  assert.throws(() => toMm(1, 'furlong'));
});

test('calibration converts measurements correctly across units (AC-005)', () => {
  const cal = new Calibration();
  assert.equal(cal.isSet, false);
  cal.set(100, 5, 'cm');
  assert.equal(cal.isSet, true);
  assert.ok(Math.abs(cal.pxPerMm - 2) < 1e-12);
  assert.ok(Math.abs(cal.pxToUnit(250, 'cm') - 12.5) < 1e-9);
  assert.ok(Math.abs(cal.pxToUnit(250, 'mm') - 125) < 1e-9);
  assert.ok(Math.abs(cal.pxToUnit(250, 'm') - 0.125) < 1e-9);
  assert.ok(Math.abs(cal.pxToUnit(250, 'in') - 125 / 25.4) < 1e-9);
  assert.ok(Math.abs(cal.pxToUnit(250, 'in') - 4.9213) < 1e-4);
  assert.ok(Math.abs(cal.pxToMm(250) - 125) < 1e-9);
});

test('calibration rejects non-positive inputs', () => {
  const cal = new Calibration();
  assert.throws(() => cal.set(0, 5, 'cm'));
  assert.throws(() => cal.set(100, -1, 'cm'));
  assert.throws(() => cal.set(100, 5, 'parsec'));
});

test('measurement lengths on a 3-4-5 triangle (AC-006)', () => {
  const cal = new Calibration();
  cal.set(120, 60, 'mm'); // 2 px/mm
  const lines = [
    { label: 'a', p1: { x: 0, y: 0 }, p2: { x: 60, y: 0 } },
    { label: 'b', p1: { x: 0, y: 0 }, p2: { x: 0, y: 80 } },
    { label: 'c', p1: { x: 60, y: 0 }, p2: { x: 0, y: 80 } },
  ];
  const px = lines.map(lineLengthPx);
  assert.ok(Math.abs(px[0] - 60) < 1e-9);
  assert.ok(Math.abs(px[1] - 80) < 1e-9);
  assert.ok(Math.abs(px[2] - 100) < 1e-9);
  const mm = lines.map((l) => cal.pxToUnit(lineLengthPx(l), 'mm'));
  assert.ok(Math.abs(mm[0] - 30) < 1e-9);
  assert.ok(Math.abs(mm[1] - 40) < 1e-9);
  assert.ok(Math.abs(mm[2] - 50) < 1e-9);
});

test('exportCSV matches model values (AC-007)', () => {
  const cal = new Calibration();
  cal.set(100, 5, 'cm');
  const lines = [
    { label: 'edge "A"', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } },
    { label: 'width', p1: { x: 0, y: 0 }, p2: { x: 0, y: 50 } },
  ];
  const csv = exportCSV(lines, cal, 'cm');
  const rows = csv.trim().split('\n');
  assert.equal(rows[0], 'label,length_px,length,unit');
  assert.equal(rows[1], '"edge ""A""",100.00,5.0000,cm');
  assert.equal(rows[2], '"width",50.00,2.5000,cm');
});

test('exportCSV without calibration leaves length empty', () => {
  const cal = new Calibration();
  const csv = exportCSV([{ label: 'l', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } }], cal, 'mm');
  assert.ok(csv.includes('"l",10.00,,mm'));
});
