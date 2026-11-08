# Homography Rectify-and-Measure Web App — Product Requirements

Status: Frozen
Owner: Main agent
Last updated: 2026-11-07
Approval: Approved by user on 2026-11-07 (plan approval recorded in session; scope = "core + export")

## Problem and Context

Photos of planar objects (documents, panels, boards, floors) taken at an angle show the object as a trapezium although it is a rectangle in reality. Users want to (1) rectify the object to its true rectangular shape, (2) calibrate pixels to real units (cm etc.), and (3) draw labeled lines to measure distances — with lengths that are metrically correct ("without actual distance shift"). Existing tools either distort aspect ratio (breaking measurement) or require desktop software. We build a dependency-light, browser-only web app for this workflow.

Research note: the "awesome-homography-estimation-and-image-alignment" list covers learned image-pair homography estimation; for user-marked correspondences the classical 4-point DLT plus metric rectification is the correct technique. Metric aspect is recovered from the quad's two vanishing points (orthogonality constraint, closed-form focal solve), with explicit fallbacks.

## Users and Stakeholders

- Primary: anyone measuring real objects from photos (DIY, inspection, documentation, design recon).
- Stakeholder: the requesting user; single-user local tool, no accounts.

## Product Goals

- Correct-looking rectification of a 4-point region to a rectangle.
- Metrically trustworthy measurements: one scale line makes all line measurements correct in real units.
- Fully client-side: works offline after load; no backend, no upload of user images anywhere.

## Success Metrics

| Metric | Baseline | Target | Measurement window/source |
| --- | --- | --- | --- |
| Aspect recovery error on synthetic known-rectangle projections | n/a | ≤ 2% | unit tests |
| Measurement error on synthetic geometry after calibration | n/a | ≤ 1% | unit tests |
| Full user flow (load → rectify → calibrate → measure → export) | n/a | completes without console errors | manual acceptance run |
| Test suite | n/a | `node --test tests/` green | every implementation loop |

## User Flows

1. **Load**: user uploads a file, drags a file in, or pastes (Ctrl/Cmd+V) an image from the clipboard.
2. **Crop**: user places/adjusts 4 freeform corner points over the trapezium-like object (handles are draggable; order auto-sorted TL,TR,BR,BL).
3. **Rectify**: user clicks Rectify; app renders a rectangular rectified image and shows which aspect method was used (EXIF / vanishing points / user dimensions / heuristic).
4. **Calibrate**: user draws a 2-point line along a known real length on the rectified image and enters the length + unit; app computes px-per-unit. Optional: entering real object W×H up-front pre-fills scale and guarantees exact aspect.
5. **Measure**: user draws any number of free lines on the rectified image, labels them, drags endpoints, and sees auto-measured lengths in the selected unit.
6. **Export**: user downloads the annotated rectified image (PNG) and/or a measurements table (CSV).

## Functional Requirements

| FR ID | Requirement | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| FR-001 | Load image via file picker, drag-and-drop, or clipboard paste | Must | Frozen | |
| FR-002 | 4-point freeform quad editor: place, drag corners, auto order TL,TR,BR,BL | Must | Frozen | |
| FR-003 | Rectify the quad region to a true rectangle via homography warp | Must | Frozen | output rectangle, no padding inside |
| FR-004 | Metric aspect determination with fallback chain: EXIF focal → vanishing-point focal solve → user-entered real W×H → mean-of-opposite-sides heuristic; active method displayed | Must | Frozen | preserves real length ratios |
| FR-005 | Scale calibration: 2-point line + real length + unit sets px-per-unit for all measurements | Must | Frozen | auto-prefilled from FR-004 user dims when provided |
| FR-006 | Measurement lines: unlimited, drag endpoints, editable labels, live real-unit lengths, delete | Must | Frozen | |
| FR-007 | Export annotated rectified image (PNG) and measurements (CSV: label, px length, real length, unit) | Must | Frozen | |
| FR-008 | Unit selector (mm / cm / m / in); displayed values convert, calibration preserved | Must | Frozen | |
| FR-009 | Graceful handling of invalid input: non-image file, self-intersecting/flat quad, zero-length scale line, oversized images (cap 4096 px longest side) | Must | Frozen | message shown, no crash |
| FR-010 | Re-edit corners after rectify and re-rectify without reloading the image | Should | Frozen | |

## Business Rules

- Measurements are only valid after calibration; uncalibrated lines show pixel length and a "set scale" hint.
- Changing the display unit never changes underlying calibration; values re-express in the new unit.
- Labels default to "Measurement N"; duplicates allowed.
- All processing is local; no network calls at runtime except optional CDN fallback (not used — library is vendored).

## Data Lifecycle

- State (image, quad, calibration, lines) lives in memory only; lost on reload. Exports are user-initiated downloads. No persistence, no telemetry.

## In Scope

- Single-image workflow: load → quad crop → rectify → calibrate → measure → export.
- Metric aspect fallback chain and its display.
- PNG/CSV export.

## Out of Scope

- Backend, accounts, cloud storage, sharing.
- Multi-image projects, batch processing, persistence/history.
- Automatic object/edge detection (quad is user-drawn).

## Non-goals

- Sub-pixel metrology-grade accuracy claims; this is a practical measuring aid.
- Mobile-first UX (must not break on touch-capable browsers, but no dedicated touch UX).

## Assumptions

| ID | Assumption | Risk | Validation plan | Status |
| --- | --- | --- | --- | --- |
| A-001 | The cropped object is planar and rectangular in reality | user error otherwise | UI hint text | Accepted |
| A-002 | Camera has zero skew, square pixels, principal point at image center | small metric error on exotic lenses | fallback chain absorbs failures | Accepted |
| A-003 | CPU warp on ≤ 4096 px images is fast enough for one-shot rectification | slow on low-end devices | Homography.js benchmarks (400→800 projective ≈ 30 ms desktop) | Accepted |
| A-004 | EXIF `FocalLengthIn35mmFilm` ≈ 36 mm sensor width for f-pixel conversion | coarse f prior | used only as first fallback; VP solve refines path | Accepted |
| A-005 | Browser with ES modules, Canvas 2D, Clipboard API (modern Chrome/Firefox/Safari) | old browsers unsupported | stated in README/hints | Accepted |

## Open Product Decisions

None — frontier cleared 2026-11-07.

## Decision Log

| Decision ID | Decision | Rationale | Decider/date | Impacted FRs |
| --- | --- | --- | --- | --- |
| D-001 | Build process follows the `spec-driven-loop` skill | user choice | user, 2026-11-07 | all |
| D-002 | Aspect ratio via auto chain: EXIF → vanishing-point solve → user W×H → heuristic | rigorous metric preservation with graceful degradation | user, 2026-11-07 | FR-004 |
| D-003 | v1 scope = core flow + export (PNG/CSV) + edit/delete lines; no history/undo | user choice | user, 2026-11-07 | FR-007, FR-010 |
| D-004 | Use Eric-Canas/Homography.js as the warp engine (vendored, MIT) | user suggestion; proven projective warp, avoids hand-rolled pixel loops | user, 2026-11-07 | FR-003 |
