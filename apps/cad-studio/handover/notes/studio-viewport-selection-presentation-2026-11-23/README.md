# D1720 — Extract viewport selection presentation from Studio App

P4 Studio structure, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `c3d3a0fc193302c64d023569caa594e447f54518`.

Move command pick scope, section selection, and visible highlight precedence to `useViewportSelectionPresentation`. Keep the original order of unavailable model, exact cut, held Fillet replacement, command end face, Band, hidden source, mate faces and current selection. The App passes document state and retains the command and section pick refs. Its total drops from 3,278 to 3,264 lines.

## Verification

- **PASS, desktop Studio WebGPU.** All 57 before-and-after state records match. Eleven cover direct History replacement of one held Fillet edge and the single-edge control. Forty cover Section face selection, cancel, re-arm and the Command palette at desktop widths 1024 and 1440 px. Six cover Extrude-to-Face target re-pick and delayed delivery after cancel or file replacement. All six browser runs have zero source changes, page errors and console errors.
- **PASS, affected viewport samples.** Section and Extrude crops at (180,130), size 800 × 590 px, have zero changed RGB pixels. The held Fillet crop differs at 8,521 pixels. On 54 rows of each Fillet preview the median horizontal error between the cyan highlight and the native line after Cancel is 0 px. Their medians are both x607 in the base and both x606 after extraction. This comparison establishes local edge alignment with the observed framing shift.
- **PASS, affected checks.** 25 Studio tests, scoped ESLint, Studio types and production build, and Git diff check.
- **NOT_RUN.** Separate browser flows for Band, mate faces or measurement, full local suites, WebGL2, mobile and live providers. The first mechanical CAD milestone remains 8/10. Issue #44 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Run the three browser commands at both revisions. Compare the complete receipt states by label and order. For image evidence, compare the specified RGB crops. For the held Fillet, also compare the darkest native line in the Cancel image with the cyan core in the preview on rows 500–553.

```sh
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/reference" --manual
D1397_SOURCE_FROZEN=1 node apps/cad-studio/test/section-face-pick-escape-browser.mjs "$OUT/section"
D845_SOURCE_FROZEN=1 node apps/cad-studio/test/extrude-end-face-preview-ownership-browser.mjs "$OUT/command"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test band-highlight extrude-end-face-pick section-face-pick-escape held-finish-replacement candidate-references
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/viewport/useViewportSelectionPresentation.ts
pnpm --dir apps/cad-studio build
git diff --check
```
