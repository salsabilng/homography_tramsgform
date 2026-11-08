# Homography Rectify-and-Measure Web App — Agent Plan

Status: Frozen
Specification approval reference: user approval 2026-11-07 (plan + spec summary approved in session)
Shared contracts frozen at version/commit: TECH_DESIGN.md Interface Contracts, 2026-11-07
Plan owner: Main agent (no subagent delegation; single implementer — tasks are sequential vertical slices)

## Frozen Shared Contracts

| Contract/type/schema | Location | Owner | Change approval rule |
| --- | --- | --- | --- |
| geometry.js function signatures | TECH_DESIGN.md §Interface Contracts | main agent | user re-approval if signatures change product behavior |
| measure.js data model (`Calibration`, `Measurement`, `UNITS`) | TECH_DESIGN.md §Interface Contracts | main agent | same |
| warp.js adapter contract (offset convention) | TECH_DESIGN.md §Interface Contracts | main agent | same |
| DOM ids | index.html (defined in TASK-005) | main agent | free within implementation |

## Dependency Graph

TASK-001 (geometry+measure math+tests) → TASK-002 (warp adapter) → TASK-005 (UI) → TASK-006 (judge).
TASK-003 (exif.js) is independent of TASK-002, needed before TASK-005 wiring.
TASK-004 (vendor lib) precedes TASK-002.

## Ownership Map

| Task ID | Allowed paths | Forbidden paths | Overlap check |
| --- | --- | --- | --- |
| TASK-001 | js/geometry.js, js/measure.js, tests/* | docs/*, vendor/* | none (serialized) |
| TASK-002 | js/warp.js | js/geometry.js | none |
| TASK-003 | js/exif.js | tests/* | none |
| TASK-004 | vendor/* | js/* | none |
| TASK-005 | index.html, css/style.css, js/main.js, js/canvas-ui.js | js/geometry.js, js/warp.js, js/measure.js, js/exif.js | none |
| TASK-006 | docs/spec-driven/homography-measure/LOOP.md | all source | none |

## Tasks

### TASK-001 — Metric math core with tests (vertical: "correct numbers")
- Objective: geometry + measurement math implemented and proven by unit tests.
- Related FRs: FR-004, FR-005, FR-006, FR-008, FR-009 (math part)
- Related ACs: AC-003, AC-004, AC-005, AC-006
- Inputs: TECH_DESIGN §Interface Contracts
- Dependencies: none
- Allowed files/directories: js/geometry.js, js/measure.js, tests/
- Forbidden files/directories: vendor/, docs/, UI files
- Required outputs: modules + tests/geometry.test.mjs (+ tests/measure.test.mjs if split)
- Required checks: `node --test tests/`
- Required evidence: passing test output
- Stop and report when: aspect recovery deviates >2% on synthetic data after reasonable fix attempts

### TASK-002 — Warp adapter over Homography.js
- Objective: `rectifyQuad()` produces the exact target rect from a quad region.
- Related FRs: FR-003
- Related ACs: AC-010
- Inputs: vendor/Homography.js API + offset convention
- Dependencies: TASK-004
- Allowed files/directories: js/warp.js
- Forbidden files/directories: js/geometry.js (import only), vendor/ (read only)
- Required outputs: adapter with clear error handling
- Required checks: manual browser verification deferred to TASK-006; static review of offset math against vendor source
- Required evidence: code + offset-convention note in LOOP.md
- Stop and report when: vendored API differs from documented behavior

### TASK-003 — EXIF focal prior
- Objective: `readFocalLengthIn35mm(file)` returns a number or null, never throws.
- Related FRs: FR-004
- Related ACs: AC-004
- Dependencies: none
- Allowed files/directories: js/exif.js
- Required outputs: minimal JPEG APP1/TIFF tag reader (tag 0xA405)
- Required checks: null-safe on non-JPEG; manual smoke on a JPEG
- Required evidence: code + smoke note in LOOP.md
- Stop and report when: n/a

### TASK-004 — Vendor Homography.js
- Objective: pinned MIT dependency available offline.
- Related FRs: FR-003
- Related ACs: AC-009 (indirect)
- Allowed files/directories: vendor/
- Required outputs: vendor/Homography.js + vendor/Homography.LICENSE
- Required checks: file present, license present
- Required evidence: `ls vendor/` output
- Stop and report when: n/a

### TASK-005 — UI and wiring (vertical: "usable app")
- Objective: complete user flows FR-001..FR-010 observable in a browser.
- Related FRs: FR-001, FR-002, FR-005..FR-010
- Related ACs: AC-001, AC-002, AC-007, AC-008, AC-010 (visual)
- Dependencies: TASK-001..004
- Allowed files/directories: index.html, css/style.css, js/main.js, js/canvas-ui.js
- Forbidden files/directories: math/adapter modules (import only)
- Required outputs: runnable app
- Required checks: manual happy path + degenerate inputs
- Required evidence: manual checklist in LOOP.md
- Stop and report when: a required flow cannot be completed

### TASK-006 — Judgment
- Objective: acceptance matrix with evidence per AC.
- Related ACs: all
- Allowed files/directories: docs/spec-driven/homography-measure/LOOP.md
- Required outputs: acceptance matrix, final state
- Required checks: `node --test tests/` re-run
- Required evidence: matrix rows
- Stop and report when: any blocking AC fails → CHANGES_REQUESTED loop

## Integration Order

TASK-004 → TASK-001 → TASK-002 → TASK-003 → TASK-005 → TASK-006 (main agent integrates all; no parallel agents).

## Main-Agent Validation Plan

1. `node --test tests/` after TASK-001 and again at judgment.
2. Browser happy path + degenerate checks (documented checklist in LOOP.md).
3. Diff review against frozen contracts before recording acceptance.
