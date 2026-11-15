# D1402 — tolerance annotation placement (partial)

## Scope and result

Issue #613 remains OPEN. Current default automatic orientation after D1401 has no overlaps in this fixture. Explicit +X front, A4 and scale 0.5 reproduce the reported five TEXT_OVER_LINES diagnostics. After tolerance acceptance, reuse the existing verified automatic label pass following fixAll. Only the counted basic 3×20 label d5 is moved; the four boxed 12 mm labels d1–d4 retain their truthful warnings. No orientation, scale, dimension reference/value, datum, frame, or diagnostic guard is changed.

Product change is limited to `packages/barocss-cad-model/src/drawing/tolerance.ts`. Tests and an independent browser fixture document the partial outcome. No claim is made that the four remaining labels are intrinsically impossible to place. Candidate experiments broadening search guards were rejected: a probe required 1,019 rebuilds and still left overlaps. That experiment is not product code.

## Verification

- Focused tolerance tests 26/26 PASS. Pinned acceptance measured 167.5 ms; repeated unresolved pass 97.5 ms. The 5,000 ms assertion is a generous regression ceiling, not an interactive latency guarantee. Browser inspector preparation measured 465.1 ms separately.
- Model and Studio TypeScript PASS after the last test edit; focused lint and diff checks PASS. Combined D1402/D1403 production build PASS.
- Actual Chrome: separately Open the reconstructed already-accepted legacy document showing five warnings; then Open the pre-tolerance seed and use actual Accept all suggestions to obtain four warnings. Initial UI flows at 1024×800 and 1440×900 PASS, with Undo/Redo, unchanged references/values/frames/datums, actual SVG/DXF export and native Save/fresh Open. The fresh-Open helper uses its default 1440×1000 viewport, not the initial 1024 width.
- Independent Python SVG/DXF reader checks d5's basic frame against its own strokes and all view areas, and matches exported text/frame correspondence. Other annotation clearance is additionally covered by unchanged diagnostics and unit invariants; this is not a global layout-proof claim.
- Manual overlapping labels and the current unpinned default orientation are UNIT-tested, not separate actual-browser flows. Manual settings and diagnostics remain unchanged; the default stays clear.
- Browser receipt reports zero page/console errors, zero watched source changes, and closed contexts/browser/server. Direct screenshot review confirmed four warnings and the moved counted label; reopened geometry/drawing remained visible.

Receipt `d1402-first` SHA256: `ee51ad08b333848b22bb39185eb3b31ee270f103f743e8bc65ffc7531a6ad7fe`.

## Remaining limits

Four basic-label overlaps remain unresolved, so #613 is not closed. Six baseline drawing-suite failures and API/golden drift remain unresolved; no full-suite/CI/all-CAD acceptance claim. No manufacturing or rendering HOLD is changed, including #608.

Disk pressure briefly paused execution. Only this task's regenerable Vite caches/build outputs were removed; source capsules, receipts, screenshots, logs and first-failure evidence remain.
