# Terminal Cut end-mode History (#685)

Original main `6f0cdb062`: actual Extrude Cut → Through all creation, accepted native geometry and native Save/fresh Open worked, but cutter History offered no end-mode or Distance control. This was an editing gap, not corruption or a failed cut.

History now offers **Cut depth: Through all / Distance** for a terminal adjacent Extrude/Difference pair. It requires the same earlier solid target on a vertical sketch, positive numeric height with `from=-height`, zero draft and no held/suppressed/made pair. Associated/pocket-floor sketches, bound/invalid depth, negative-height representation and following features remain outside admission. Every setter rechecks the current graph. The sketch, target, IDs and other nodes are unchanged.

Distance starts as an explicit 8 mm draft, matching creation, rather than reusing the historical Through snapshot as a pocket depth. Repeated mode changes clear discarded numeric drafts. Through uses the existing native current-target calculation. No kernel/schema expansion. The dynamic mode is History-only: existing HUD fields and numeric application stay unchanged.

## Verification

- Original focused tests: 0 PASS / 3 RED due to absent mode. Final 18/18: six new tests plus Through all, Hole ends and Extrude Draft binding. Current target/mode recheck, original immutability, special exclusions, codec/native output, underside direction and HUD numeric behavior covered.
- Scoped lint, syntax/diff checks, Model and Studio type checks PASS. Studio build PASS, 8.00s. Full suite NOT_RUN.
- Actual frozen Chrome: UI-created Through all → Distance 4, exact whole-document assertion allowing only cutter height/from/marker; Undo/Redo; repeated mode switches; blank/zero/negative input blocking; Cancel; 10001 mm native range refusal preserving accepted document and geometry; both modes Save/fresh Open and reedited values PASS.
- Existing actual regressions: Through all follows stock extension 10→14 while snapshot stays unchanged; circular Distance Cut with two prior bores; drafted Cut including collapsed-wall refusal. All PASS after the fixture correction below.
- Final baseline/fixed/regression capsules unchanged (1077–1078 tracked sources), page/console errors 0, owned contexts/browser/server closed. Screenshots inspected.

Independent native checks: 40×30×10 stock and 8×8 cut. Through volume `12000−64×10=11360`; Distance 4 volume `12000−64×4=11744` mm³ (native 11744.000000000002), pocket floor Z6, stock bottom Z0 with one loop instead of the through opening's two. Strict-valid single native body and displayed mass match. World-frame underside behavior is a focused test, not a second actual-browser qualification.

## Retained failures and limits

First underside unit fixture used normal −Z at origin Y0, reversing local Y outside the stock. Corrected its origin to Y30 without product changes; retained first failing log. First Through regression waited for the old visible readout text and instead found a hidden select option. Replaced that one locator with an exact Cut depth value assertion. The new actual flow passed on both runs; distance/draft/type/build after the initial regression failure were NOT_RUN until the final frozen batch passed.

No general tilted/associated/cut-to-face transition, parameter-bound depth conversion, topology rematching of later features, new persistence semantics, manufacturing or HOLD expansion. Existing document ownership/evaluation guards remain. Task-local evidence only; doc-sync remains paused. Final heavy batch had approximately19.4→17.4 GiB free, above the task-added2 GiB reserve; no cleanup performed.

Commands: `node packages/barocss-cad-model/scripts/test.mjs cut-depth-mode-history throughCut hole-end-history extrude-draft-binding`; four drivers `cut-depth-mode-history-browser.mjs`, `extrude-through-all-history-browser.mjs`, `extrude-cut-distance-browser.mjs`, `extrude-draft-cut-history-browser.mjs` under their frozen envs and the shared heavy gate; `pnpm --dir packages/barocss-cad-model type-check`; `pnpm --dir apps/cad-studio build`.
