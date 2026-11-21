# D1604 — Propose Extrude to face from the current Agent review

P1, row 07, [#322](https://github.com/barocss/cad/issues/322) and [#222](https://github.com/barocss/cad/issues/222). Base `20fe176adee1d0a8b9226d79653877f84707249f`.

Use `features.command` with `command: extrude`, `values: { depth: to-face, sketch: n2 }`, `faces: [n1.bottom]` and the current `expectedRevision`. The local Agent resolves one exact native face and one stable active sketch ID in the base part. It uses the same selection and build rules as the Studio command. The result stores the native target and derives its height on rebuild. At autonomy 1, the Agent requests Studio approval.

- **PASS, local MCP and desktop Studio WebGPU.** Review two different target heights. Refuse a missing or stale pin, mixed distance values and the wrong cap. Retain the input file bytes during each refusal. Refuse direct mutation and Agent-side approval at autonomy 1. Render the pending proposal in Studio with the accepted document intact. User approval records the decision and adds one bound extrusion. Undo and Redo restore the pending and approved states exactly.
- **PASS, native geometry and persistence.** The approved post has a 10 × 10 mm footprint and reaches `n1.bottom` at Z20. Its native volume is 1999.9999999999998 mm³, in agreement with the independent formula 100 × height. Native Save and fresh Open preserve both outputs and their exact inspected geometry. Change the target start to Z26 through Studio History. The same saved target gives a 2600 mm³ post with four native corners at Z26. The separate cylinder remains 720π mm³.
- **PASS, affected checks.** 61 Model and 32 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. Model admission covers the existing rectangular target and the circular target. The frozen product run includes 1162 files with zero file changes, runtime errors and console errors.
- **FAIL, base capability by source inspection.** The prior Agent command never supplied the Studio end-face selection context. The existing Studio To face feature remained available.
- **NOT_RUN.** Live providers, placed parts, additional Studio target families, other renderers, exchange, mobile and full local suites. #322 and #222 remain open.

Use Node 22.19.0, installed Chrome and Playwright. Run under the gate and keep captures outside Git.

```sh
pnpm --dir packages/barocss-cad-model test face-end-extrude offset-face-native
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/chat/part/features.ts packages/barocss-cad-model/test/face-end-extrude.test.ts apps/cad-studio/test/reviewed-extrude-to-face-browser.mjs
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp batch-changes-mcp proposal history-feature-apply
pnpm --dir apps/cad-studio build
D1604_SOURCE_FROZEN=1 node apps/cad-studio/test/reviewed-extrude-to-face-browser.mjs "$EVIDENCE"
node --check apps/cad-studio/test/reviewed-extrude-to-face-browser.mjs
git diff --check
```
