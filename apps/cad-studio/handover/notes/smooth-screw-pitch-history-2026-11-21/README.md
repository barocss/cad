# D1556 — Edit Smooth Screw pitch in Studio History

2026-11-21 · P5 · [Roadmap row 07](../../roadmap-rows/07.md) · [#630](https://github.com/barocss/cad/issues/630) · Base a66b1a5f0d36bc900a8c56e8c30d349ec9e68acc.

For an intact terminal external-axis Screw, Studio History shows Pitch per revolution in place of Total height. Recover the turn count from the ordered section copies. Multiply pitch by that count to set the axial advance. Change the heights through the existing Smooth Loft edit. Keep the original sketch, common axis plane, signed winding, section copies and feature ID. Validate pitch and axial advance against the creation limits before applying. The existing generic height API retains its field. This Studio edit uses the current native file without a schema change.

- **PASS, actual baseline Studio.** The D1552 project opened with the 50 mm Total height editor and had no Pitch per revolution field.
- **PASS, actual desktop Studio.** At −450°, the pitch field reads 40 mm. Zero, negative, below-tolerance and excess-advance inputs block Apply and preserve the exact document. Change pitch to 56 mm. The 16 sections now advance 70 mm, with the original copy nodes, body key and six face and twelve edge names retained. The result is one valid closed solid. Volume changes from 4,800.2801298565255 to 6,720.392181799152 mm³. For 31 samples on each of four native rails, the worst deviation from the expected axial scale is 2.132e-14 mm. Undo and Redo restore the exact documents. Save and fresh Open retain pitch 56 and native digest `48d61303b1a84c9ca36f002630ee4100fe132e324cf1cabacf3166cac63ff26b`. The frozen run reports zero runtime errors, console errors and source changes.
- **PASS, affected checks.** 13 Model and 31 Studio tests, scoped ESLint, Model type check, Studio type check and production build, browser syntax and Git diff. The Model tests cover the existing tilted-axis fixture at +450° and −180°, invalid pitch values and the exact edited native round trip.
- **FAIL, corrected during development.** A byte-equality assertion between two independently authored routes found floating-point differences from scaling the stored stations. The corrected test checks their topology and sampled edges to 1e-8 mm, and retains exact B-rep equality across reopen of the same edited document.
- **NOT_RUN.** Revision-pinned Agent pitch editing, Screw winding edits, neutral export, arbitrary profiles, a second desktop renderer for this editor, and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate each heavy run and keep evidence outside Git. Run the baseline flag with the new driver on the recorded base.

```sh
pnpm exec eslint apps/cad-studio/src/{app/featureNumberInput.ts,ui/NodeEditor.tsx} apps/cad-studio/test/smooth-screw-pitch-browser.mjs packages/barocss-cad-model/src/app/smoothLoftTurn.ts packages/barocss-cad-model/test/smooth-screw-command.test.ts
pnpm --dir packages/barocss-cad-model test smooth-screw-command smooth-turn-angle smooth-loft-height
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test history-number viewport display-mode
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-screw-pitch-browser.mjs
git diff --check
SCREW_PITCH_FROZEN=1 node apps/cad-studio/test/smooth-screw-pitch-browser.mjs "$EVIDENCE/baseline" "$D1552/agent-approved-smooth-screw.bcad" --baseline
SCREW_PITCH_FROZEN=1 node apps/cad-studio/test/smooth-screw-pitch-browser.mjs "$EVIDENCE/candidate" "$D1552/agent-approved-smooth-screw.bcad"
```
