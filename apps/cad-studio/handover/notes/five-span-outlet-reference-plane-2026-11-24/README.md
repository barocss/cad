# D1854 — Bind the original five-span outlet to a parallel native reference

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#17](https://github.com/barocss/cad/issues/17). Base `34700e05b5c3814e0f7651f8cca28e1476367df3`.

Offset face adds **To plane** for the original straight outlet of a five-span paired Exact Sweep. Both source and donor come from the same exact native prefix. The existing plane binding stores the separate donor's feature identity, face and local plane witness. Lowering measures the signed distance along the native outlet normal and calls the established signed Offset. The Kernel still replays the whole original part before moving the two straight end poles.

- **PASS, native and Model.** The anti-parallel and parallel donor choices produce signed moves from X36 to X40, X32 and X37 mm. Each result retains two separate passages, original native incidence, the inlet and all 48 internal join charts. Independent section area and path length give volumes 2403.9644737231, 2147.9644737231 and 2307.9644737231 mm³. Tilt, same-plane placement, stale donor witness and an outlet length of zero refuse. The shorter Sweep and the original inlet remain distance-only.
- **PASS, actual desktop Studio.** The top donor face refuses; the opposite-normal side accepts. Editing the existing donor Move from X0 to X−8 moves the outlet with it and retains the exact stored binding. The user can reselect the parallel opposing side in Offset History. Undo, Redo, native Save and fresh Open retain the new binding and exact body. Opening a collapse case preserves the current document. The independent prism To plane control passes. The final two runs capture 11 states with 1,212 frozen files per workflow and zero page, console or source-change errors.
- **PASS, affected checks.** 64 Kernel, 121 Model and 9 Studio tests, Model and Studio types, Studio production build, scoped ESLint, browser syntax and Git diff check.
- **FAIL, corrected browser preparation.** The first driver listed itself as an absolute path in its required capsule keys. It now uses the repository-relative key; the final native Studio workflows pass.
- **NOT_RUN.** Full local suites, other renderers, tilted replacements, inlet binding, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured. #17 stays open for its wider acceptance.

```sh
node --test --test-concurrency=1 packages/barocss-cad/test/exact-{spaced,line-arc,arc-line}-paired-duct-sweep.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs
pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-handle paired-elbow-outlet-offset-evidence offset-to-plane offset-plane-retention offset-face-native native-offset-face feature-handles toolset tool-contract
pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1854_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/studio"
D1265_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-to-plane-browser.mjs "$OUT/prism-control" axis
git diff --check
```
