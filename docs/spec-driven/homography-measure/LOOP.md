# Homography Rectify-and-Measure Web App — Delivery Loop

Current state: accepted
Current loop: LOOP-001 (final)
Frozen specification: docs/spec-driven/homography-measure/{PRD,TECH_DESIGN,ACCEPTANCE}.md (Frozen 2026-11-07)
Current objective: complete
Blocking issue: none
Next action: none — delivered 2026-11-07
Last updated: 2026-11-07

## Current Loop — LOOP-001

- Objective: build the approved app end to end, then judge against ACCEPTANCE.md
- Related FRs/ACs: all
- Agent assignments: main agent (all tasks, no subagents)
- Dependencies: AGENT_PLAN.md integration order
- Outputs: index.html, css/style.css, js/{geometry,exif,warp,measure,canvas-ui,main}.js, vendor/{Homography.js,delaunator-stub.js,Homography.LICENSE}, tests/{geometry,measure}.test.mjs
- Files changed: see Outputs; plus spec docs and this file
- Commands/checks executed:
  - `node --test tests/` → 18/18 pass (final run 2026-11-07)
  - `node /tmp/opencode/e2e.mjs` (headless Chromium E2E; preserved copy at tests/e2e-browser.mjs, needs `npm i puppeteer-core` and a static server on :8123) → 17/17 checks pass (final run 2026-11-07)
  - `node /tmp/opencode/debug-warp.mjs` (adapter offset/pixel-extent probe) → paper fills output edge-to-edge (firstX 0..383, firstY 0..254)
- Results: all blocking ACs pass with evidence
- Evidence:
  - unit tests: tests/geometry.test.mjs, tests/measure.test.mjs (aspect recovery ≤2%, focal recovery ≤5%, unit conversion, 3-4-5 measurements, CSV content)
  - E2E transcript: all 17 checks PASS (file load, paste, corner placement, VP badge `f≈1100 px · ratio 1.500` = true camera values, 30.00 cm full-width measurement, 300.00 mm unit switch, exports, degenerate rejections, zero page errors)
  - screenshots: evidence/01-loaded-quad.png, evidence/02-rectified-measured.png, evidence/03-degenerate-rejected.png
  - export artifacts inspected: CSV header `label,length_px,length,unit` + `"Measurement 1",384.00,30.0000,cm`; PNG 44988 bytes
- Main-agent judgment: **ACCEPTED**
- Failure conditions observed during development (fixed before final judgment; history preserved):
  1. Vendored Homography.js imported `delaunator` from a CDN → broke offline/module loading. Fixed: `vendor/delaunator-stub.js` + one-line documented patch (only `piecewiseaffine` needs it).
  2. Warp adapter sign error: `drawImage(warped, -offX, -offY)` displaced content by 2×offset (paper landed at +70,+99 px). Fixed to `drawImage(warped, offX, offY)`; verified by pixel-extent probe.
  3. `render()` did not clear before drawing → overlay labels accumulated over transparent bases. Fixed: clearRect + background fill first.
  4. `downloadBlob` revoked the object URL after 1 s → PNG downloads lagged/blocked in headless Chromium. Fixed: 30 s revoke delay.
  5. E2E harness bugs (not app bugs): arbitrary quad is not a physical rectangle projection (aspect expectations invalid), camera model rotated about origin (object out of frame → clamped corners), missing object-dims inputs, favicon 404 counted as page error. All fixed in harness.
- Rework requirements: none
- Unresolved risks: A-003 (warp performance on very low-end devices; capped at 4096 px input / 2048 px output), A-004 (EXIF 35 mm-film focal prior is coarse), small-angle/heavily-rotated rectangles may transpose width/height in the output (documented behavior; measurements remain correct)
- Next state: accepted
- Next action: none

## Acceptance Matrix

| Acceptance ID | Result | Evidence | Defect/Caveat |
| --- | --- | --- | --- |
| AC-001 | ACCEPTED | e2e: file input + Ctrl+V paste both load; non-image rejected | — |
| AC-002 | ACCEPTED | e2e: 4 clicks place corners, status updates; unit: orderQuad/isConvexQuad | — |
| AC-003 | ACCEPTED | unit: aspect error <2% (EXIF + VP paths), focal error <5% on synthetic K[R\|t] projections | — |
| AC-004 | ACCEPTED | unit: all 4 methods + never-throws; e2e badge shows `vanishing points` on clean input | method badge documents degradation (by design) |
| AC-005 | ACCEPTED | unit: pxPerMm=2, 250 px → 12.5 cm / 125 mm / 0.125 m / 4.9213 in; e2e cm→mm switch | — |
| AC-006 | ACCEPTED | unit: 3-4-5 triangle → 30/40/50 mm; e2e full-width line = 30.00 cm | — |
| AC-007 | ACCEPTED | e2e: CSV header/rows match UI values; PNG 44988 bytes with annotations | — |
| AC-008 | ACCEPTED | e2e: non-image file, collinear quad, set-scale-without-line all rejected with messages; >4096 px downscale implemented (load path) | — |
| AC-009 | ACCEPTED | `node --test tests/` exit 0, 18/18 | — |
| AC-010 | ACCEPTED | e2e: rectified ratio 1.500 = true 1.5; debug probe: content fills rect edge-to-edge; screenshot grid axis-aligned | output may transpose W/H for heavily rotated rectangles (measurements unaffected) |

## Prior Loops

(none — single loop; failed intermediate attempts recorded under "Failure conditions observed")
