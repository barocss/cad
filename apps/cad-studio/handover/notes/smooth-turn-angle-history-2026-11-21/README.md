# D1524 — Edit a saved Smooth Turn angle within its existing stations

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `30d2146dc2e5e06aec51901470bd1bd3a54d7f1c`.

History offers **Turn angle** for the recognized terminal Smooth Turn. The Model checks ownership of the copied station sketches and compares all their ordered corners with the recovered signed rotation. The edit regenerates only the rotated copies. It keeps the first copy, source, Loft node, station heights and all IDs. The range is ±30° per existing span. Total height remains available in the same editor. Individual station height controls stay with general Loft edits. The generated turn shows its whole height and angle.

- **PASS, desktop Studio.** Reopen the 70 mm −450° turn from D1523. After entering a valid draft, type 451°. Apply is disabled and the accepted document stays exact. Change the angle to +360°. All sixteen stations and the height remain exact. Undo, Redo, native Save and fresh Open pass, with +360° and 70 mm visible in History. A zero-angle control becomes a straight prism and Undo restores the saved +360° result.
- **PASS, native geometry.** The −450°, +360° and zero-angle results each remain one strict closed solid with six faces, twelve edges and the same body, face and edge identities. Independently calculated station coordinates agree within 2.02e-14 mm, and the nonzero results have the requested signed angular derivative. Volumes are 6720.392181799139, 6720.192951203837 and 6719.999999999993 mm³. The +360° output reopens with digest `f443cab04ef9e8d77a0723239a32f22cb431ff29204c8bc1c0bcf02f0a26255a`.
- **PASS, focused checks.** 33 Model and 43 Studio tests, scoped lint, Model and Studio types, Studio build, browser syntax and Git diff. Model controls qualify a tilted axis, fixed station counts of 7, 13 and 16, and refusal to recognise changed or shared copies. The actual D1523 total-height control still passes.
- **NOT_RUN.** Station-count growth, changes to arbitrary profiles, STEP, full local suites and mobile. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work and freeze source writes during Studio. Keep screenshots and native receipts outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs smooth-turn-angle smooth-loft-height ruled-turn-command loft-guide-command loft-section-history-edit revision-pinned-command
pnpm --dir apps/cad-studio test feature-number-input command-apply history-feature-apply history-feature-editor
pnpm exec eslint packages/barocss-cad-model/src/app/{smoothLoftTurn,ruledTurnCommand,editFields}.ts apps/cad-studio/src/app/featureNumberInput.ts packages/barocss-cad-model/test/smooth-turn-angle.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/smooth-turn-angle-browser.mjs
git diff --check
cd apps/cad-studio
SMOOTH_TURN_ANGLE_FROZEN=1 node test/smooth-turn-angle-browser.mjs "$EVIDENCE/angle" "$D1523/smooth-turn-height-70.bcad"
SMOOTH_LOFT_HEIGHT_FROZEN=1 node test/smooth-loft-height-browser.mjs "$EVIDENCE/height-control" "$D1522/agent-approved-smooth-turn.bcad"
```
