# D1523 — Edit the total height of an existing Smooth Loft

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `44170293f0ff1d7251f13e60375d93c2766008fe`.

History adds **Total height** for an unguided Smooth Loft with numeric, ordered height sections. It stretches every station along the original sketch normal and keeps the first station fixed. The edit changes only the Loft's section heights. The UI requires a positive value.

- **PASS, desktop Studio.** Open the user-approved −450° Smooth Turn from D1522. Height 0 refuses with Apply disabled and the document exact. Change 50 to 70 mm in History. Undo, Redo, native Save and fresh Open pass. The reopened editor shows Total height 70 mm.
- **PASS, native geometry.** The body key, face and edge names, source sketches and copied section references are exact. The 50 and 70 mm results each contain one strict closed solid with six faces, twelve edges and four full-height rails. The rail samples agree with an independent axial stretch within 2.14e-14 mm. The volumes are 4800.280129856528 and 6720.392181799139 mm³, a factor of 1.4 within the tested tolerance. The reopened 70 mm digest is `295a5aa815e118dae6fd6906874b62f1b9ccf1fab7b0fc083fc3c78fec08bc0c`.
- **PASS, focused checks.** 31 Model and 43 Studio tests, scoped lint, Model and Studio types, Studio build, browser syntax and Git diff. A tilted Model control stretches along its normal. The existing desktop Ruled Turn workflow retains its width edit and native reopening.
- **NOT_RUN.** Parameter-driven or guided station height edits, total turn-angle editing, full local suites, STEP and mobile. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs, freeze worktree writes during Studio and retain receipts outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs smooth-loft-height ruled-turn-command loft-section-history-edit loft-guide-command tool-contract
pnpm --dir apps/cad-studio test feature-number-input command-apply history-feature-apply history-feature-editor
pnpm exec eslint packages/barocss-cad-model/src/app/{smoothLoftHeight,editFields}.ts apps/cad-studio/src/app/featureNumberInput.ts packages/barocss-cad-model/test/smooth-loft-height.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/smooth-loft-height-browser.mjs
git diff --check
cd apps/cad-studio
SMOOTH_LOFT_HEIGHT_FROZEN=1 node test/smooth-loft-height-browser.mjs "$EVIDENCE/height" "$D1522/agent-approved-smooth-turn.bcad"
RULED_TURN_SOURCE_FROZEN=1 node test/ruled-turn-browser.mjs "$EVIDENCE/ruled-control"
```
