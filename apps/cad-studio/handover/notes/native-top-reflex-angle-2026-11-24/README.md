# D1827 — Place the long angle of a shared native Top corner

P2, rows 11 and 16. [Issue #742](https://github.com/barocss/cad/issues/742). Base `63b62ca11348b120b5916d4e5e122d55028d43a8`.

Add a separate Studio Reflex angle tool for an unbroken Top view of one exact part solid. Its two complete visible native straight edges must share exactly one original vertex. Bind their names to their native edge and vertex IDs, 3D endpoints and stored midpoints. Reject a reused name with a changed midpoint or a rematched source. Persist the optional `mode: "reflex"` on the angle dimension. Older ordinary angles retain their placement-selected sector. The opt-in uses the existing document shape and sheet renderer.

- **FAIL — reproduced on the base.** The two real L-plate edges share the physical vertex (20, 20, 6) mm. Actual Studio preview shows 90° in all four placement quadrants. Its applied SVG arc uses the short sweep. No explicit reflex mode is offered.
- **PASS — native reference and angle checks.** Resolve 270° for the L corner and 300° for the 60° corner. Swapping edges, reversing projected endpoint order or moving the label across the corner cannot change the chosen long sector. Reject projected-only coincidence, two different native vertex IDs, hidden or ambiguous edges, parallel or out-of-plane edges and replacement geometry with recycled names. Malformed opt-ins are refused before saved Open. A changed reference cannot be substituted silently.
- **PASS — actual desktop Studio and SVG.** Ordinary 90° and reflex 270° use the same two original references. A separated edge is refused before the angle is staged. Preview and Apply show the long SVG arc for 270° and 300°. Moving the label preserves the selected angle and references through Undo, Redo, Save and fresh Open. The actual exported SVG reproduces the value and large-arc flag. A Top break is refused on a drawing with a reflex angle. A re-opened changed source keeps the dimension unresolved, with no replacement angle. The existing ordinary 45°/135° desktop control passes at 1024 and 1440 CSS px. Candidate and control have 15 desktop checkpoints with zero page errors, console errors or source changes.
- **PASS — affected checks.** 149 Model tests passed, including eight new bounded cases, and the eight focused tests passed again after the typed raw reader fix. Five Studio tests, Model and Studio types, changed-files lint outside DrawingWorkspace, Studio production build, driver syntax and Git diff check pass.
- **FAIL — inherited comparison fixtures.** A one-page PDF hash and the ordinary SVG/DXF unit goldens differ from their old committed references. The base replay produces the same 13 actual differing digest lines. The inherited references were left intact. DrawingWorkspace also reports the same three existing unused-symbol lint findings on the pinned base and candidate. The first type check found one untyped parameter in the new raw reader. An explicit record type predicate fixes it.
- **NOT_RUN.** Full local suites, actual PDF/DXF output of the new dimension, mobile, alternate renderers, assemblies, broken Top views and general disjoint-edge angle modes. First mechanical CAD remains 8/10 accepted. Overall CAD completion remains unmeasured.

## Reproduction

Use Node 22.19.0, installed desktop Chrome and Playwright, the heavy gate and external output. The browser baseline uses `--baseline` with only the driver on the original producer.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test drawing-reflex-angle drawing.test drawing-ordinary-text drawing-units drawing-sheets drawing-current-contract drawing-scope drawing-section-hatch drawing-section-kinds
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test drawing-section-revision drawing-worker section-annotation
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
D1827_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-reflex-angle-browser.mjs "$OUT/studio"
ANGLE_PREVIEW_FROZEN=1 node apps/cad-studio/test/drawing-angle-preview-fill-browser.mjs "$OUT/ordinary-control"
git diff --check
```
