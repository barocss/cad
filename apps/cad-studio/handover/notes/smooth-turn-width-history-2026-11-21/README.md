# D1538 — Edit all saved Smooth Turn section widths from History

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `be7e2b354352980137de5ed502de2a582f241fa0`.

The History editor offers **Turn width** on a terminal rectangular Smooth Turn under the existing section-ownership check. It rebuilds the owned section copies around the centre of their first rectangle. It takes the angle from the recovered unrounded rotation. It preserves depth, plane, section count, spacing, signed winding, the source sketch and the Loft node. The numeric input uses the existing kernel linear floor and modeling range. The native rebuild validates the edited candidate.

- **PASS, actual desktop Studio.** Create a 12 × 8 mm, +360°, 40 mm Smooth Turn next to the Ruled control, save and open it, then edit the width from 12 to 16 mm in History. Zero, 1e-7 mm and 10001 mm disable Apply and keep the exact original document. The valid width applies. Undo, Redo, native Save and fresh Open pass. The reopened fields read 16 mm, +360° and 40 mm. The Ruled control stays exact.
- **PASS, native continuity and geometry.** All four rails pass the independently rotated 16 × 8 mm corner positions at all 13 stations within 1e-8 mm. The rails keep the same cubic knot vectors. The native solid is strict-valid with four continuous sides, two caps, 12 edges and identical topology IDs. Native volume changes from 3840.4939184888217 to 5120.658557985098 mm³, consistent with the independent 16/12 ratio within 1e-7 mm³. The Studio body volume matches. The reopened native digest agrees exactly. Runtime errors, console errors and frozen-source changes are zero.
- **PASS, affected checks.** 35 Model and 43 Studio tests, scoped lint, Model and Studio types, Studio build, generated tool inventory, browser syntax and Git diff. Focused geometry includes 0°, both signs at 360° and 450°, and a fractional angle on a tilted frame.
- **FAIL.** None in the completed runs.
- **NOT_RUN.** Full local suites, mobile, separate Agent client runtime and other renderers. Fine silhouette marks visible at some angles with AO off need separate display inspection. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work and keep screenshots and raw receipts outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs ruled-turn-command smooth-turn-angle loft-section-history-edit revision-pinned-command tool-contract toolset
pnpm --dir apps/cad-studio test feature-number-input history-feature-apply history-feature-editor toolset-mcp
pnpm exec eslint packages/barocss-cad-model/src/app/smoothLoftTurn.ts packages/barocss-cad-model/src/app/editFields.ts packages/barocss-cad-model/test/smooth-turn-angle.test.ts apps/cad-studio/src/app/featureNumberInput.ts apps/cad-studio/test/smooth-turn-browser.mjs
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/smooth-turn-browser.mjs
git diff --check
SMOOTH_TURN_SOURCE_FROZEN=1 node apps/cad-studio/test/smooth-turn-browser.mjs "$EVIDENCE" --edit-width
```
