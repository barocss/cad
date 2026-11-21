# D1513 — Drag a saved tapered upper-cap Offset from its native face

P5, row 31, [#629](https://github.com/barocss/cad/issues/629). Base `bab0f2bbc4c90c2ceeb4258be74992395d66ec4f`.

History's existing **Edit offset** command now shows a distance handle for one positive terminal native Offset on an ordinary rectangular taper. It checks the saved original signed top-face reference and the current accepted rectangular cap. Handle placement uses the exact accepted plane and the rectangle centre. A head-on drag uses the existing screen-up scalar conversion, fixed at pointer-down. The current command, body, document and Worker own the gesture and its preview. Other saved Offset profiles continue to use their existing typed command.

## Verification

- **PASS, actual baseline and desktop Studio.** On 20 × 10 × 12 mm rectangular stock with 15° Draft, the previous History editor accepted typed +4 mm with no viewport distance handle. The new handle starts at the accepted +3 mm cap. In Top/Ortho, the axis projects to 0.00878 CSS px per mm and the anchor is within 0.000031 CSS px of the independent cap centre. The camera stays fixed. A physical 28 CSS px upward drag previews +4 mm at 27.93941 CSS px per millimetre of the view, with the normal half-step rounding.
- **PASS, cancellation and history.** Cancel preserves the +3 mm recipe. Cancel during a held pointer and reopening the editor retire the old gesture. Its late move and release leave the new edit at +3 mm. Apply changes only the existing Offset distance. Undo, Redo and typed +4 mm match. The face name, signed source reference and feature ID survive native Save and fresh Open.
- **PASS, independent native shape.** The top cap rises from Z15 to Z16 mm. All five other support planes, six face names, 12 edge names and the eight expected corner positions agree with the taper oracle. Strict native read confirms one closed solid. Native and Studio volumes at +4 mm are 1534.2562938509973 mm³ against 1534.2562938509968 mm³ independently. Dragged, typed and reopened inspector results match exactly.
- **PASS, affected checks.** 47 Model and 74 Studio tests, scoped lint, Model and Studio types, Studio build, browser syntax and Git diff checks. An independent native review found a different decimal rounding expression in the first candidate. The final handle uses the same representation as the stored source signature and passes a 0.1 mm centre regression. The final actual upper/lower Offset and circular History Fillet controls pass.
- **FAIL, initial control assertion.** The older driver expected the legacy three-node recipe for a new straight box Offset. D1458 uses the direct native recipe. The updated control verifies the existing native node, exact target and volume. Both controls pass on the corrected driver.
- **NOT_RUN.** New handles on signed inward offsets, lower caps, later features and reference-plane targets, additional browsers, mobile and full local suites. The existing typed paths remain covered by the stated controls. #629 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work, freeze worktree writes during Studio and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs offset-face-native native-offset-face
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag offset-face-launch-view offset-collapse-feedback offset-plane-pick-feedback command-hud-actions preview-lifetime history-feature-editor
pnpm exec eslint apps/cad-studio/src/{App.tsx,app/commandState.ts,ui/HistoryFeatureEditor.tsx,state/historyFilletRadiusReceipt.ts,state/useCommandPreview.ts,viewport/useCommandGizmos.ts} apps/cad-studio/test/history-fillet-radius-receipt.test.ts packages/barocss-cad-model/src/app/offsetFaceEdit.ts packages/barocss-cad-model/test/offset-face-native.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/offset-drafted-cap-browser.mjs
git diff --check
cd apps/cad-studio
D1254_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/baseline" --history-handle-baseline
D1254_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/history" --history-handle
D1254_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/upper-control"
D1255_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/lower-control" --lower
CIRCULAR_FILLET_HANDLE_FROZEN=1 node test/circular-fillet-radius-handle-browser.mjs "$EVIDENCE/circular-control" --history
```

Run the first desktop flow before the product change. Use a separate output folder for each run.
