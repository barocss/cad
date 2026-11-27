# D2079 — Calibrate visible part envelopes from two attached views

P1 [row 04](../../roadmap-rows/04.md) and [row 08](../../roadmap-rows/08.md) · [#747](https://github.com/barocss/cad/issues/747) · Base `fc07b06a5cbe0bfe9055fbbbcfff9f08d8329fa2`.

The existing `image` tool adds `measure_pair`. Read each image with `image.layers` and supply the matching layer IDs, two distinct image numbers and the measured outside diameter of the front ring. The workflow assumes near-orthographic views. A front annulus gives the width scale. The matching vertical side band gives the side scale. Each paired part compares its top and bottom positions relative to the reference head before the tool returns visible width, height and depth estimates. The registration check allows two trace pixels in each view. A missing side layer leaves that part's depth unknown. The response records the source trace digest, identifies the supplied diameter, and marks internal geometry, hidden surfaces and manufacturing tolerances unknown.

The tool reads the existing attached traces. It changes no document. The user or caller supplies the layer pairing. The first profile supports one near-front ring and its matching narrower side band. General image correspondence, camera recovery and automatic native model generation are later work.

## Verification

- **PASS, actual desktop Studio and local MCP.** The browser attaches the front, side and negative-control PNGs as real files. Local Chat forwards the actual traces and a scripted offline provider calls the production MCP image actions. The reported trace digest is `737a65a47af9084d818d1a74d38769c288589c3ae69bb442a32356435d90bcf6`. The unedited starter part stays unchanged. The run retains 1,599 frozen source hashes through cleanup and reports zero page or console errors.
- **PASS, independent synthetic dimensions.** The paired 200 × 185 px reference fixture uses an 84 mm ring head. Visible width and depth agree with the fixture's independent dimensions within 0.5 mm on all four parts. The measured width/depth pairs in millimetres are `84 / 53.705`, `22.016 / 20.030`, `25.644 / 23.660` and `7.631 / 7.636` for the head, handle, filter cap and button. The tool refuses reversed views, a displaced handle in the side view and a zero diameter. It reports `null` for handle depth when the side assignment is omitted.
- **PASS, regression and feature checks.** The existing real drawing attachment run passes both same-name revisions and fresh conversation reset. The 15 Model and five Studio tool contract checks, scoped ESLint, type checks, browser-driver syntax, diff check and Studio production build pass.
- **FAIL, early checks.** The first synthetic pair had a genuine vertical registration error of 6 px at the handle. The matched fixture aligns the handle in both views, and the original mismatch remains a refusal control. The first tool-contract check identified the missing structured response schema. The first type check found an optional error string. Early browser runs on this host lost the scripted child to `SIGKILL`. The offline harness uses the pinned Node executable and sends the mock its prompt through stdin. The final runs pass using the production Studio and MCP code.
- **NOT_RUN.** Live model interpretation, photographs from a real product, native multi-part construction, STEP, the full local suites and mobile. First mechanical CAD acceptance remains 8/10. Product-wide completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop execution and the feature build.
PHOTO_PAIR_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/drawing-image-intake-browser.mjs "$OUT/candidate" --photo-pair
D598_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/drawing-image-intake-browser.mjs "$OUT/drawing-regression"
pnpm --dir packages/barocss-cad-model test toolset tool-contract
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp
tsc --noEmit -p packages/barocss-cad-model
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
