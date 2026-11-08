# Homography Rectify-and-Measure Web App — Acceptance Contract

Status: Frozen
Based on PRD/Tech Design version/date: Frozen, 2026-11-07
Approval: Approved by user on 2026-11-07

## Scope Boundaries

### In Scope
Load/paste → 4-point quad → rectify → scale calibration → labeled measurement lines → PNG/CSV export, with metric aspect fallback chain (PRD In Scope).

### Out of Scope
Backend, accounts, persistence, multi-image projects, automatic object detection.

### Non-goals
Metrology-grade accuracy claims; dedicated mobile UX.

### Deferred
Undo stack; touch-specific gestures; EXIF lens-model refinement beyond FocalLengthIn35mmFilm.

### Assumptions
A-001..A-005 from PRD (planar rectangle object; zero-skew center-principal-point camera; ≤4096 px CPU warp acceptable; 35mm-film EXIF prior; modern browser).

### Release Blockers
All ACs marked Blocking: Yes must pass with required evidence.

### Definition of Done
- All blocking ACs have evidence recorded in the acceptance matrix in `LOOP.md`.
- `node --test tests/` exits 0.
- App runs from a static server with no console errors during the happy path.

## Acceptance Criteria

### AC-001 — Image loading works via file picker and clipboard paste
- Related FRs: FR-001
- Blocking: Yes
- Scenario: User loads an image into the empty app.
- Preconditions: App served over http; no image loaded.
- Action/event: Select a file via the file input; also press Ctrl/Cmd+V with an image in the clipboard.
- Expected result: Image is displayed in the quad-editing stage both times; loading a second image resets state.
- Required evidence: manual check recorded in LOOP.md; non-image file shows error message and does not crash.

### AC-002 — Quad editor places and orders 4 corners, rejects invalid quads
- Related FRs: FR-002, FR-009
- Blocking: Yes
- Scenario: User marks the object region.
- Preconditions: Image loaded (AC-001).
- Action/event: Click 4 points; drag handles afterwards; attempt Rectify with a self-intersecting or near-collinear quad.
- Expected result: 4 handles render connected as a closed quad, all draggable; Rectify with invalid quad is refused with a visible message; corners are auto-ordered TL,TR,BR,BL regardless of click order.
- Required evidence: manual check recorded in LOOP.md; `isConvexQuad`/`orderQuad` unit tests in `tests/geometry.test.mjs`.

### AC-003 — Metric aspect recovery is correct on synthetic projections
- Related FRs: FR-004
- Blocking: Yes
- Scenario: A known W×H rectangle is projected with a known camera (f, rotation, translation) producing a trapezium quad.
- Preconditions: none (pure math test).
- Action/event: Run `node --test tests/`; test feeds the synthetic quad to `determineAspect` with EXIF f and, separately, with f solved from vanishing points.
- Expected result: recovered aspect within 2% of true W/H in both cases; solved f within 5% of the true f.
- Required evidence: `node --test tests/` output showing passing test cases.

### AC-004 — Aspect fallback chain degrades gracefully and reports method
- Related FRs: FR-004, FR-009
- Blocking: Yes
- Scenario: Vanishing points are unavailable or the focal solve is degenerate.
- Preconditions: synthetic quad with parallel opposite sides (vanishing points at infinity).
- Action/event: `determineAspect` without EXIF/user dims; then with user dims; then heuristic-only.
- Expected result: no throw; method reported as `user-dims` when dims supplied (aspect exactly W/H), otherwise `heuristic`; EXIF f uses method `exif`; VP path uses method `vanishing-points`. UI displays the active method.
- Required evidence: `node --test tests/` cases asserting method + aspect; manual check that the method badge is visible.

### AC-005 — Calibration converts measurements correctly across units
- Related FRs: FR-005, FR-008
- Blocking: Yes
- Scenario: Known pixel length calibrated to a real length.
- Preconditions: none (pure math test).
- Action/event: Calibrate 100 px = 5 cm; measure 250 px; switch unit mm/cm/m/in.
- Expected result: pxPerMm = 2; value reads 12.5 cm, 125 mm, 0.125 m, ≈4.9213 in; changing display unit does not alter calibration.
- Required evidence: `node --test tests/` output.

### AC-006 — Measurement line lengths are geometrically correct
- Related FRs: FR-006
- Blocking: Yes
- Scenario: Synthetic right triangle 3-4-5 in calibrated units.
- Preconditions: pure math test over the measurement model.
- Action/event: Compute lengths of lines of 60, 80 and 100 px with pxPerMm = 2 (i.e. mm 30/40/50).
- Expected result: values exactly 30, 40, 50 mm (within 1e-9); CSV rows match model values.
- Required evidence: `node --test tests/` output.

### AC-007 — Exports match on-screen state
- Related FRs: FR-007
- Blocking: Yes
- Scenario: Calibrated session with several labeled lines.
- Preconditions: rectified + calibrated + ≥2 measurement lines (happy path of AC-001..006).
- Action/event: Click Export PNG and Export CSV.
- Expected result: PNG downloads showing the rectified image with the same lines/labels as on screen; CSV downloads with header `label,length_px,length,unit` and one row per line whose values match the panel; unit column equals the selected unit.
- Required evidence: manual check recorded in LOOP.md (downloaded files inspected); CSV string built by `exportCSV` covered by unit test.

### AC-008 — Degenerate and invalid inputs are rejected without crashes
- Related FRs: FR-009
- Blocking: Yes
- Scenario: Adversarial inputs.
- Preconditions: app running.
- Action/event: (a) non-image file via picker; (b) rectify with collinear points; (c) zero-length scale line; (d) image larger than 4096 px on its longest side.
- Expected result: (a),(b),(c) show a visible message and keep the app usable; (d) image is downscaled to ≤4096 px and the flow continues.
- Required evidence: manual checks recorded in LOOP.md.

### AC-009 — Test suite is green
- Related FRs: all
- Blocking: Yes
- Scenario: CI-style check.
- Preconditions: Node.js ≥ 18.
- Action/event: `node --test tests/`.
- Expected result: exit code 0, zero failing tests.
- Required evidence: command output in LOOP.md.

### AC-010 — Rectified output is the exact target rectangle with correct aspect
- Related FRs: FR-003, FR-004
- Blocking: Yes
- Scenario: Full rectification through the Homography.js adapter.
- Preconditions: browser session with a synthetic or real photo of a rectangle.
- Action/event: Place 4 corners on a real rectangle, Rectify.
- Expected result: output image contains only the rect region (no transparent padding, no crop of the object); object edges are parallel to the image borders; synthetic aspect within AC-003 tolerance end-to-end (aspect derived from quad in → rect dims out).
- Required evidence: `metricAspectFromQuad` unit test (determines outW/outH ratio) + manual visual check recorded in LOOP.md.

## Coverage Map

| FR ID | AC IDs | Coverage notes |
| --- | --- | --- |
| FR-001 | AC-001 | manual |
| FR-002 | AC-002 | unit + manual |
| FR-003 | AC-010 | unit (aspect) + manual (visual) |
| FR-004 | AC-003, AC-004, AC-010 | unit |
| FR-005 | AC-005 | unit |
| FR-006 | AC-006 | unit + manual |
| FR-007 | AC-007 | unit (CSV) + manual (PNG) |
| FR-008 | AC-005 | unit |
| FR-009 | AC-002, AC-004, AC-008 | unit + manual |
| FR-010 | AC-010 | manual (re-edit corners → re-rectify) |
