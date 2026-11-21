# D1560 — Edit signed Smooth Screw winding in Studio History

2026-11-21 · P5 · [Roadmap row 07](../../roadmap-rows/07.md) · [#630](https://github.com/barocss/cad/issues/630) · Base a40f58ae7b7a3a5cd351957e7949286fb60c8089.

Edit Turn angle on a supported terminal external-axis rectangular Screw. Keep the original axis plane, section references and section count. Changing angle magnitude changes advance in proportion to the magnitude at the current draft pitch. Reversing direction at the same magnitude keeps the axial stations exact. History accepts numeric pitch and angle changes in either order in one draft. The maximum magnitude is 30 degrees per existing interval.

Both the previous and regenerated rows need measurable external-axis movement. A section centroid must move more than four times the native linear fit tolerance. A centered fit keeps the centroid fixed, so this rules out that earlier native fit branch. The native external-axis fit checks signed angular motion, and the Apply request also requires one strictly valid closed solid at the exact owned evaluation revision. Zero, collapsed advance and angles the candidate cannot recover are refused before Apply. A legacy saved angle too small to distinguish the two fit paths retains its existing file and pitch editor.

- **PASS, actual desktop Studio WebGPU.** Reopen the D1556 Screw at pitch 56 and −450°, with 70 mm advance. Refuse zero, 451°, a below-tolerance input and an empty field after a valid draft while retaining the exact document. Apply +360° for a 56 mm advance, then −360° without changing any axial station. Positive and negative volumes both equal 5,376.154360963081 mm³. The original solid key and all native topology IDs persist. Undo/Redo and Save/fresh Open preserve the edited document and B-rep digest `5f44386c2cfdfb8861fa65ef64fb31b63cd2f3410a2f6adc9444dc92bc7600ad`. A combined pitch 64 and +270° edit gives 48 mm advance and volume 4,608.047342410326 mm³. Zero runtime errors, console errors and source changes.
- **PASS, independent geometry checks.** Measure 241 samples per native rail in the actual saved fixture. The signed angular derivative stays positive in the requested direction, the principal increments recover the full winding, and the largest error at authored stations is 2.275e-14 mm. Model checks also use a tilted axis, both draft edit orders, a measurable small signed winding at maximum pitch, and the ambiguous legacy case.
- **PASS, affected checks.** 21 Model and 40 Studio tests, scoped ESLint, Model type check, Studio build and type check, browser syntax and Git diff. Controller tests require the validation target and reject the failed or stale evaluation before commit.
- **FAIL, corrected during development.** Early type checks found incorrect narrowing in the Model rule assertion and the Studio commit-array assertion. The corrected assertions pass both package checks.
- **NOT_RUN.** Local Agent winding edit, WebGL2 for this editor, external exchange, nonrectangular Screw profiles, mobile and full local suites. #630 remains open.

Run with Node 22.19.0 and the installed desktop Chrome and Playwright. Gate each heavy run and keep evidence outside Git.

```sh
pnpm exec eslint apps/cad-studio/src/{app/featureNumberInput.ts,engine/client.ts,engine/engine.worker.ts,state/historyFeatureApply.ts,ui/NodeEditor.tsx} apps/cad-studio/test/{smooth-screw-winding-browser.mjs,history-feature-apply.test.ts} packages/barocss-cad-model/src/{app/smoothLoftTurn.ts,engine/evaluate.ts} packages/barocss-cad-model/test/smooth-screw-command.test.ts
pnpm --dir packages/barocss-cad-model test smooth-screw-command smooth-turn-angle smooth-triangular-turn
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test history-feature-apply history-number viewport
SCREW_WINDING_FROZEN=1 node apps/cad-studio/test/smooth-screw-winding-browser.mjs "$EVIDENCE" "$D1556/smooth-screw-pitch-56.bcad"
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-screw-winding-browser.mjs
git diff --check
```
