# D1821 — Retire 3D annotation selection with its drawing source

P4 Studio interaction, rows 06 and 15. [Issue #268](https://github.com/barocss/cad/issues/268). Base `a0264c9bf9cdf92f6432677c5ccf19dec30d9d65`.

Store the selected annotation with the accepted document generation in the PMI hook. A current sheet retires a selected ID when an ordinary drawing edit removes it. Temporary loss of a preview while a sheet rebuilds preserves a valid selection. Opening a different document starts with no carried selection, even when the new drawing reuses the same ID. Ordinary model selection keeps its existing owner and handlers.

| Original acceptance | Verified evidence |
| --- | --- |
| Current mode and real display bounds | [WebGL2 fallback](https://github.com/barocss/cad/issues/268#issuecomment-6931591691) uses actual SVG text boxes. [WebGPU](https://github.com/barocss/cad/issues/268#issuecomment-6988729031) uses the submitted glyph layout. Actual planar, facing and SVG paths cover CSS pixels at DPR1 and DPR2 and zoom. |
| Camera, canvas and renderer lifetime | [D1817](../pmi-viewport-lifecycle-2026-11-24/README.md) verifies both sides of the 10° mode threshold, stale glyph rejection after orbit and resize at DPR1 and DPR2, and real owned WebGPU device replacement. Forced WebGL2 startup and normal WebGPU startup have actual runs. The existing product starts its backend before the first annotation frame and has no live backend toggle. |
| Alignment, overlap and native selection | D1821 selects both left- and right-facing diameter leaders, their original edge and an isolated leader stroke. A dimension's alignment is resolved into its baseline before display. Actual SVG and GPU select the lower cell of a two-row attached frame. Coincident displayed glyphs pick the first source until it is removed. Both selections follow the exact authored source. |
| Visibility and stale regions | D1821 moves the perspective eye from world X253.0422205848104 to X47.945889356796314 across the diameter annotation plane at X60. The retained annotations are behind the eye, and earlier glyph positions miss on both backends. The focused bounds tests cover blank text, viewport clipping and behind-eye exclusion. D1817 supplies hide and former-raster misses. |
| Drawing edits and document lifecycle | D1821 confirms Drawing removal, Undo and Redo in Model, the remaining coincident glyph's new owner, and accepted Open with the same frame ID and a new value. Older exact [native Save and fresh Open](https://github.com/barocss/cad/issues/268#issuecomment-7059186268), hide, empty Open and New part evidence is retained. All picks preserve the accepted document and geometry. |

- **PASS.** 34 Studio tests, 11 GPU glyph and bounds tests, GPU library build, scoped lint, Studio types, Studio build and driver syntax. Final actual WebGL2 and WebGPU runs have 30 snapshots, 659 frozen files per run and zero source changes, page errors or console errors. In the same-ID case, both backends show the new Ø0.24 frame with no selected annotation or source edge.
- **FAIL — original product reproductions.** The old selected annotation ID survives deletion even with only the unrelated retained label in the current sheet. Another saved drawing reuses the frame ID and opens with its Ø0.24 frame already selected. The final runs verify both repairs.
- **FAIL — corrected setup assumptions.** The empty frame field is omitted after removal. Left-side diameter formatting moves the baseline and emits a start-aligned mark. The distribution-backed glyph tests need the GPU library build before running. The final checks pass.
- **NOT_RUN.** Full local suites, mobile, alternate browsers, organic device failures and live providers. The renderer redesign HOLD remains separate. The issue's supported desktop acceptance is ready for closure after the exact CI and posted scenes.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test pmi camera-projector selection-edge
pnpm --dir packages/barocss-gpu build:library
node --test --test-concurrency=1 packages/barocss-gpu/tests/glyphs.test.mjs packages/barocss-gpu/tests/viewer-label-bounds.test.mjs
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/viewport/useWorkspacePreviews.ts apps/cad-studio/test/pmi-source-layout-browser.mjs
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
D1821_SOURCE_FROZEN=1 node apps/cad-studio/test/pmi-source-layout-browser.mjs "$OUT/webgl2"
D1821_SOURCE_FROZEN=1 node apps/cad-studio/test/pmi-source-layout-browser.mjs "$OUT/webgpu" --webgpu
git diff --check
```

For the supplemental leader case, use the admitted native model in `packages/barocss-cad/conformance/r14/orient-cross-hole-y-plus/case.json`. Use the default drawing orientation and two right-view diameters referencing `n1.side1|n2.side0#2` near (60,15,15) mm. Set their positions to (−8,21) and (38,21) mm. On desktop Right perspective, select both displayed labels and the isolated left leader. Clear selection and zoom toward the centre of the canvas until the eye crosses X60. With annotations still enabled, both previous label pixels must miss. Repeat with WebGL2 startup and WebGPU.
