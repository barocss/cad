# D1588 — Author centred circular-segment Twist from one sketch

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `ea87327a44e7c24c0054412f98d12bd55e941a36`.

Use one standalone sketch with one line and one circular arc through Smooth Turn. Copy the section about its area centroid and certify the compact geometry through D1587. Keep the source sketch and reuse the existing Height and Turn angle History fields. This profile takes a nonzero signed angle. The saved station count determines the range for History edits.

- **FAIL, previous desktop Studio.** The Smooth Turn palette item was disabled for the original selected circular segment. Enter left the document exact and created no body.
- **PASS, actual desktop Studio WebGPU.** Preview, Apply, Save and fresh Open both ±360° windings at 40 mm. History reverses −360° to +360° with exact equality to direct +360° creation. Raising the height to 48 mm retains the source and every saved section profile. Fresh Open matches the exact document and native digest and shows 48 mm and +360° in History.
- **PASS, refusal and scope.** A 0° angle disables Apply in creation and History and retains the current document. The new History exposes height and turn angle for this profile. Focused tests keep the existing rectangle, triangle and exterior Screw cases and restrict Agent creation and angle edits to their existing profiles.
- **PASS, native and independent checks.** Every accepted result is one strict closed solid with 5 faces, 9 edges, 6 vertices and 3 cubic rails. The widest authored station deviation is below 1.47e-14 mm. The largest measured area-centroid deviation is below 1.43e-14 mm, with zero split-arc seam gap. The 40 mm volumes are 221.1349854920097 and 221.13498549200943 mm³. The 48 mm volume is 265.3619825904123 mm³. They agree with the independent circular-segment integral and its height ratio within 6e-13 mm³. A separate Model control preserves a centroid offset from the sketch origin.
- **PASS, affected checks.** 52 Model tests, 38 Studio tests, Model types, scoped ESLint, Studio build, browser syntax and Git diff. The actual Studio receipt has zero runtime errors, console errors and frozen source changes.
- **NOT_RUN.** Agent approval and STEP exchange of the centred profile, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and keep captures and native projects outside Git.

```sh
pnpm --dir packages/barocss-cad-model test smooth-turn-angle smooth-screw-command smooth-triangular-turn api-loft-guide
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/app/{lineArcScrew,ruledTurnCommand,smoothLoftTurn,editFields}.ts packages/barocss-cad-model/src/chat/part/features.ts packages/barocss-cad-model/test/smooth-turn-angle.test.ts apps/cad-studio/src/app/featureNumberInput.ts apps/cad-studio/test/external-axis-screw-loft-browser.mjs
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/studio" --single-sketch --centred-line-arc
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/external-axis-screw-loft-browser.mjs
git diff --check
```
