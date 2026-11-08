# Homography Rectify-and-Measure Web App — Technical Design

Status: Frozen
Based on PRD version/date: Frozen, 2026-11-07
Owner: Main agent
Approval: Approved by user on 2026-11-07

## Current System State

Greenfield. `/home/blackr/Work/homography` contains only `.agents/skills` and an empty `hello` file. No git repo, no package.json, no build tooling.

## Overall Approach

Static, dependency-light web app: plain HTML + CSS + ES modules, no build step. Served by any static server (`python3 -m http.server`). Math modules are pure functions testable with Node's built-in `node --test`. The only third-party code is Eric-Canas/Homography.js (MIT), vendored and pinned to npm `homography@1.8.1`, used solely as the projective warp engine through an isolating adapter.

## Modules and Responsibilities

| Module | Responsibility | Related FRs | Owned contracts |
| --- | --- | --- | --- |
| `index.html` / `css/style.css` | Layout: toolbar, canvas stage, side panel | all | DOM ids |
| `js/geometry.js` | Pure math: 3×3 ops, quad validity, vanishing points, closed-form focal solve, metric rectification aspect, 4-pt DLT, fallback chain `determineAspect()` | FR-004, FR-009 | see Interface Contracts |
| `js/exif.js` | Minimal JPEG EXIF reader for `FocalLengthIn35mmFilm` | FR-004 | `readFocalLengthIn35mm(file) → Promise<number\|null>` |
| `js/warp.js` | Adapter over vendored Homography.js: pre-crop to quad bbox → projective warp quad→rect → crop to exact rect | FR-003 | `rectifyQuad(srcImageData, quad, outW, outH) → {imageData, canvas}` |
| `js/measure.js` | Calibration model, unit conversion, measurements collection, PNG/CSV export | FR-005..008 | `Calibration`, `Measurement`, `toMm/fromMm`, `exportCSV`, `exportPNG` |
| `js/canvas-ui.js` | Pointer interactions: `QuadEditor` (4 draggable corners) and `LineLayer` (draw/select/drag lines) | FR-002, FR-006, FR-010 | class APIs |
| `js/main.js` | State machine (`empty → quad → rectified`), wiring, messages | all | — |
| `vendor/Homography.js` | Third-party warp engine (MIT, `homography@1.8.1`) | FR-003 | upstream API |
| `tests/geometry.test.mjs` | Unit tests for geometry + measure math | AC-003, AC-004, AC-005, AC-006 | — |

## Interface Contracts

`js/geometry.js` (pure, no DOM):

- `isConvexQuad(quad: {x,y}[4]) → boolean` — also rejects self-intersecting and near-degenerate (collinear) quads.
- `orderQuad(quad) → quad` — sorts to TL,TR,BR,BL (angle around centroid, rotated to start top-left).
- `solveHomography4(src: [x,y][4], dst: [x,y][4]) → number[9]` — DLT, h33-normalized, row-major 3×3. Throws on degenerate input.
- `applyHomography(H, p) → {x,y}` — homogeneous divide.
- `computeVanishingPoints(quad) → {v1: [x,y,w], v2: [x,y,w]}` — v1 = top∩bottom edges, v2 = left∩right edges; w may be 0 (point at infinity).
- `solveFocalFromVanishingPoints(v1, v2, cx, cy) → number|null` — closed form from orthogonality `v1ᵀωv2 = 0` with `ω = A/f² + e3e3ᵀ`; returns f in px, null if `f² ≤ 0`/non-finite/degenerate.
- `cholesky3(W) → number[9]|null` — lower-triangular L with `W = L·Lᵀ`, null if not PD.
- `metricAspectFromQuad(quad, f, cx, cy) → {aspect, width, height}|null` — affine rectification `H_A` (last row = normalized `l∞ = v1×v2`), DIAC `ω' = H_A⁻ᵀ ω H_A⁻¹`, metric `H_M = chol(ω')ᵀ`, mapped quad mean opposite sides → aspect.
- `determineAspect(quad, opts: {imageWidth, imageHeight, exifFocal35mm, userWidth, userHeight}) → {aspect, method, f}` — fallback chain. `method ∈ {'exif', 'vanishing-points', 'user-dims', 'heuristic'}`; `f` in px or null. Heuristic: mean of opposite side pixel lengths.

`js/measure.js`:

- `UNITS = {mm: 1, cm: 10, m: 1000, in: 25.4}` (mm per unit).
- `Calibration {pxPerMm: number|null, source: {pixelLength, realLength, unit}|null}` with `lengthToUnit(pxLen, unit) → number|null`.
- `exportCSV(lines, calibration, unit) → string`, `exportPNG(rectCanvas, lines, calibration, unit) → Blob` (async; draws overlays on offscreen canvas).

`js/warp.js`:

- `rectifyQuad(srcImageData, quad, outW, outH) → {imageData, canvas}` — quad in src pixel coords (ordered); output exactly `outW×outH` covering only the rect region.
- Offset contract with vendored lib: after `warp()`, output pixel (0,0) = dst-space `(homo._xOutputOffset, homo._yOutputOffset)`; the target rect is cropped at `(-_xOutputOffset, -_yOutputOffset)`. Verified by source reading of `calculateTransformLimits` (vendor/Homography.js:1503).
- All point arrays passed with `pointsAreNormalized = false` (the lib's auto-detection misfires for small pixel values).

## Data Model and Migration

In-memory only (PRD Data Lifecycle). No schema, no migration.

- `state = {imageBitmap, srcImageData, quad, aspectInfo, rectified: {canvas, imageData}, calibration, lines: Measurement[], unit, tool}`.
- `Measurement = {id, p1, p2, label, selected}` — points in rectified-image pixel coords.

## State Transitions

`empty --load--> quad --rectify--> rectified --edit corners--> quad` (rectified result retained until re-rectify). In `rectified`, tools: `scale` (single 2-point line) and `measure` (multi lines). Loading a new image resets everything.

## Concurrency, Consistency, and Idempotency

Single-user, single-threaded UI. Rectification is a synchronous one-shot computation (≤ 4096 px cap keeps worst case well under 1 s). Exports are pure functions of current state; re-clicking export yields identical files.

## Authentication, Authorization, Privacy, and Security

No auth. Privacy: images never leave the browser. Security: no `eval`, no innerHTML with user data (labels rendered via `textContent`); vendored dependency pinned by version with license preserved (`vendor/Homography.LICENSE`).

## Failures, Retry, Recovery, and Degradation

- Load failure / non-image → message, stay in current state.
- Degenerate quad → Rectify blocked with message (FR-009).
- Aspect chain: each step failure silently falls through to next; active method always displayed so degradation is visible.
- Focal solve failure (noise, near-parallel edges) → user-dims → heuristic; never throws.
- Warping errors (thrown by lib) → caught, message shown.

## Performance and Capacity

- Input capped at 4096 px longest side (downscaled at load, FR-009; ASSUMPTION A-003).
- Homography.js projective warp benchmark ≈ 21 ms (400²) / 30 ms (800²) desktop first frame — one-shot use is trivially within budget.
- Overlay redraws are cheap 2D canvas ops per pointer event.

## Observability: Logs, Metrics, and Alerts

Dev-only `console.error` on unexpected failures; user-visible status bar messages for all user-actionable errors. No telemetry (non-goal).

## Compatibility

Modern evergreen browsers (ASSUMPTION A-005): ES modules, Canvas 2D, `navigator.clipboard` paste events, `canvas.toBlob`. Fallback: file input always available even if clipboard fails.

## Release and Rollback

Static files; "release" = files in the working directory. Rollback = git/backup restore. No migrations.

## Test Boundaries

- **Unit-tested (node --test, no deps)**: all of `geometry.js` and the pure parts of `measure.js` (units, calibration, CSV). These own the metric-correctness guarantees (AC-003..006).
- **Manual / browser**: DOM wiring, canvas interactions, Homography.js adapter output placement (AC-010), exports (AC-007), paste/upload (AC-001).
- Not tested: vendored library internals (trusted, MIT, benchmarked upstream).

## Alternatives Considered

| Alternative | Decision | Rationale |
| --- | --- | --- |
| Hand-rolled CPU inverse warp (bilinear) | Rejected | More code, slower than Homography.js; user suggested the library |
| WebGL texture warp | Rejected | Complexity, shader debugging, no metric benefit |
| CDN import of Homography.js | Rejected | Offline reproducibility; vendoring keeps app self-contained |
| Learned homography (awesome-homography list) | Rejected | Solves image-pair alignment without correspondences; not applicable to manual 4-point workflow |
| Affine-only rectification | Rejected | Cannot remove perspective skew |
| Mean-of-opposite-sides aspect only | Kept as last fallback | Systematic error under strong perspective; replaced by VP-based metric aspect |
| Aspect = user W×H always | Kept as fallback 3 | Extra step; auto chain avoids it when possible |

## Blocked Technical Issues

None.

## Technical Decision Log

| Decision ID | Decision | Alternatives | Rationale | Related FRs |
| --- | --- | --- | --- | --- |
| TD-001 | Warp engine = vendored `homography@1.8.1` behind `warp.js` adapter | own warp, WebGL | user request (D-004); adapter isolates quirks (auto output sizing, coordinate auto-detect) | FR-003 |
| TD-002 | Metric aspect via DIAC rectification with closed-form f from two vanishing points | heuristic only, user dims only | exact for noise-free input; preserves lengths up to the single scale calibration | FR-004 |
| TD-003 | Output rect size: height = clamp(mean quad side × natural scale, 256..2048 px), width = round(height × aspect) | fixed size | keeps resolution comparable to source while bounding memory | FR-003 |
| TD-004 | Own tiny DLT kept in `geometry.js` (not only tests) | library-internal H only | needed to map quad bbox→rect placement cross-check and used by tests; ~40 lines | FR-003, AC-003 |
| TD-005 | EXIF prior = `FocalLengthIn35mmFilm`/36·imageWidth | full EXIF parse, lens model | simple, usually present in phone JPEGs; only a fallback prior | FR-004 |
| TD-006 | Calibration canonical unit = px per mm | per-display-unit storage | unit switching is then pure conversion (FR-008) | FR-005, FR-008 |
