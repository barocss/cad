# D1856 — Pin both Agent images of the plane-bound outlet

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#324](https://github.com/barocss/cad/issues/324). Base `6a73e55832d84901dbc8887e198bed98c8288231`.

The current local Agent can render and inspect the pending reference-plane edit. The review checks an original five-span paired Sweep and a separate exact rectangular Extrude with a Translate. The original outlet and donor face resolve on their own current native bodies. Replay reconstructs the exact stored binding from the donor's plane witness. The unchanged donor and exact candidate must match this replay before the view is made.

- **PASS, native identity.** The proof returns the original outlet body and face, translated donor body and original native face, and the same outlet face on the candidate body. Each record includes the actual face ID and native body digest. The opposed donor in the product fixture moves the outlet from X36 to X40 and adds 128 mm³. Both apertures, the original inlet and 48 internal joins remain. The focused opposite-normal, aligned-normal, inward and stale or altered recipe cases pass.
- **PASS, actual local Agent and Studio.** Normal and opposite PNGs share the candidate native body digest and have distinct image and review digests. Exact inspection returns the same native faces for both valid pins. A mismatched orientation or proposal revision refuses. Editing the donor in Studio makes the proposal stale and invalidates the original image pin. Explicit approval on the original revision and native Save → fresh Open retain the exact reviewed body, donor and saved target. The earlier signed-distance review still passes its original Studio path. Two runs capture 12 states with zero page, console and source-change errors.
- **PASS, affected checks.** 45 Model tests, 4 Studio tests, Model and Studio types, Studio production build, scoped ESLint, browser syntax and Git diff check.
- **FAIL, corrected fixture type.** The first Model type check found a missing display name on the new synthetic Sweep. The fixture now includes its required name and the final focused tests and types pass.
- **NOT_RUN.** Unbounded proposals, additional donor families, a separate retained Direct rail in this fixture, mobile and live providers. #324's broader client and cost conditions remain open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-plane-proposal-review paired-elbow-outlet-offset-evidence proposals.test tool-contract
pnpm --dir apps/cad-studio test tool-contract-mcp command-build-failure
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1856_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/agent" --agent-review
D1823_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/distance-control" --s-bend --review-outlet
git diff --check
```

| Reviewed value | SHA-256 |
| --- | --- |
| Normal image | `969bfec61095e31fc97998d67eadeddf6728813d427976be919b162503923bc5` |
| Opposite image | `e577fd33920712b594d7b8c3cfe67c5217cb8b3c46b66d57b5bb64e47189ebd7` |
| Candidate native body | `f5b0a1c7abdcd7c7b23f5fb7899da8e0a9d205b7263bd6f1c69123d1038ca52f` |
| Unchanged donor body | `23721f8060f9e78b1d7084425fa1829e7bcbf67535a5ddccb0b615370745e00c` |
