# D1887 — Exclude hidden construction from click and drag Trim

P1 [row 09](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md), [#233](https://github.com/barocss/cad/issues/233). Base `6f70dbcba807c42f42d6397555abdca8cf7a5e64`.

Model Trim keeps edit protection and crossing visibility as separate inputs. Studio removes hidden construction from hover, click, direct Trim and every Drag Trim crossing calculation. It keeps the hidden entities in the authored draft. A visible protected shape can still bound a trim during drag replay. The outdated boundary guidance has been removed from the panel. The existing construction visibility tooltip gives the new behavior.

- **FAIL, original desktop.** Hidden construction at Y15 and Y25 still defined a red interior preview and clipped the visible X10 line. The expected-old-behavior reproduction captured three states.
- **PASS, actual desktop.** Five states verify the current behavior. With guides hidden, click preview runs from (10,5) to (10,35), click removes that whole line, and Undo restores it. Drag refuses without two distinct interior boundaries and adds no draft history. Showing construction restores the (10,15) to (10,25) preview and cut. The outer remnants, accepted document and Undo/Redo are verified.
- **PASS, native control and repair.** Six actual states verify a visible-guided drag, open-chain Finish refusal for both retained remnants, ordinary Line closure and project Save, fresh Open and sketch re-entry. The native two-millimetre Extrude retains its accepted feature ID, the guide entity IDs and the repaired eight-sided hole. Rebuilt and reopened volumes are both 2100 mm³. The native centroid is (19.6428571429,20,1) mm.
- **PASS, actual same-window Chrome tab switch and native capture release.** Eight states verify both interruption modes. Chrome identifies two distinct tabs in one window and moves native focus to the other tab and back. The held gesture had three preview intervals and active pointer capture. The tab switch emits trusted blur and capture loss. Late pointer-up adds no edit. An independent retry commits once and one Undo restores all three intervals. Explicit native release also passes without switching tabs. Chrome did not emit a visibility-change event in the successful run, so this is evidence for real tab switching via its native focus path and explicit capture loss.
- **PASS, affected checks.** 32 Studio and 71 Model tests. Model types, scoped lint and the Studio production build pass.
- **FAIL, earlier harnesses.** The first Model selector matched no test files. The first repair run expected an old Finish error sentence and found the current two-chain message with the correct endpoints. The hardened test verifies both current endpoints. The first headed interruption attempt stopped before pointer-down when the keyboard help modal covered the fixture. A later held attempt got trusted blur/capture loss without a visibility event. A follow-up lost capture before the switch. The final driver requires both tabs to share one native window, disables emulated focus and checks real focus in both directions, including immediately after the initial screenshot.
- **NOT_RUN.** Whole local test suites, mobile and additional unsupported sketch families. First mechanical CAD remains 8/10. Whole product completion remains unmeasured.

## Reproduce

Use Node 22.19.0 and the existing desktop Chrome and Playwright. Run heavy checks serially and freeze the checkout during Studio.

```sh
pnpm --dir apps/cad-studio test sketch-cut-visibility drag-trim trim.test sketchIds.test
pnpm --dir packages/barocss-cad-model test sketch-bezier sketch-reopen-parameters sketch-reopen-main-role sketch-reopen-side-ids
HIDDEN_TRIM_FROZEN=1 node apps/cad-studio/test/hidden-trim-boundary-browser.mjs "$OUT/fixed"
D877_SOURCE_FROZEN=1 node apps/cad-studio/test/material-drag-trim-browser.mjs "$OUT/repair"
DRAG_TRIM_INTERRUPTION_FROZEN=1 node apps/cad-studio/test/drag-trim-interruption-browser.mjs "$OUT/interruption"
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
```

## Original issue closeout

[D876](../straight-drag-trim-2026-11-13/README.md) covers the sparse three-cut gesture, independent intervals, single Undo/Redo, cancellation and native replay. [D877](../material-drag-trim-2026-11-13/README.md) and [D1073](../sketch-repair-line-draft-history-2026-11-14/README.md) cover material repair and draft history. [D1058](../drag-trim-tool-rail-boundary-2026-11-14/README.md) covers the tool rail. The scoped planner regression covers sample density, path reversal and repeat, ambiguous hits, nonfinite coordinates and the atomic budget. This delivery supplies the originally missing hidden boundary policy and native Chrome tab interruption. Final closure follows exact successful CI and confirmed attached Studio scenes.
