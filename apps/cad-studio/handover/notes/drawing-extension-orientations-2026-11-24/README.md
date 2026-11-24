# D1922 — Qualify extension roles on vertical and aligned dimensions

P2 [row 11](../../roadmap-rows/11.md), [#240](https://github.com/barocss/cad/issues/240). Base `6c4812e12db5d16bcfa174d9b7bc0d48c2673065`. The original implementation already supports both orientations. Production code and storage did not need a change.

- **PASS, actual desktop Studio.** A 10 mm vertical dimension and a 64.77653896280658 mm aligned dimension share the same native Front endpoints in opposite order. The vertical A witness initially lies 0.5 paper mm from the dimension line, inside the normal gap. Hide B removes its one visible line. Dragging the same dimension restores A, while B remains hidden. Undo, Redo and the exact saved document retain the selected role. The aligned dimension stays unchanged.
- **PASS, independent choice and file lifetime.** In the reversed aligned dimension, Hide A and Hide B affect the two roles obtained from the ordered model references. The main line, text and arrows stay unchanged. The vertical choice stays independent. After Save and fresh Open, the aligned control still shows Hide B. Show both restores both aligned lines while the vertical choice stays active.
- **PASS, independent original output.** Ten actual Studio checkpoints, nine SVG downloads and 18 DXF downloads, half R12 and half R2000. Parsed SVG primitives match Studio. ezdxf 1.4.5 audits 36 native dimension entities and independently checks ordered points, measurements, original geometry blocks and DIMSE1/2 overrides. Regeneration preserves the requested role. The regeneration entry point derives the aligned angle from the read definition points, and its own gap policy can add a naturally short unsuppressed witness. No export bytes are changed.
- **PASS, focused checks.** Sixteen Model tests, one actual Studio source commit regression test, scoped ESLint and diff check.
- **FAIL, earlier test harness.** The pointer test initially assumed a relative placement delta. The single-dimension drag uses the pointer's local paper position. An early reader also assumed ezdxf vectors support slices. Final execution corrected both test errors.
- **NOT_RUN.** Source loss, Auto lifecycle, multiple sheets, scale, units, view changes, live 3D, PDF, mobile and paid providers. First mechanical CAD remains 8/10. Overall completion is unmeasured. The parent issue remains open.

```sh
D1922_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-extension-orientation-browser.mjs "$OUT/studio"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test drawing-extension annotations3d
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test drawing-extension-commit drawing-native
pnpm exec eslint apps/cad-studio/test/drawing-extension-orientation-browser.mjs
git diff --check
```
