# D2063 — Identify the two Fix constraints that prevent a smaller arc radius

P1 [row 09](../../roadmap-rows/09.md) · [#763](https://github.com/barocss/cad/issues/763) · Reproduced on `00a7b39247b825936cfd4f329217e364e5e1265c`.

A closed XY outline has three lines and one circular arc. Two explicit Fix rules on points 2 and 3 give the arc a 20 mm chord. R9 is impossible because the chord exceeds the requested 18 mm diameter. Actual Studio retained the existing R12.5 but gave a generic local-solve refusal in both the Sketch panel and the on-canvas dimension. It offered no way to find either Fix.

After a refused edit, the Studio diagnostic checks the finite authored Fix locations and a margin for solver tolerance and roundoff. Both input paths can identify the two exact Fix rows and report the minimum radius. A duplicate Fix, missing explicit endpoint, non-arc or insufficient separation leaves the existing diagnostic route. The reducer, solver and accepted geometry remain on their existing paths. The panel shares its current-draft ownership check for length and radius inputs.

## Verification

- **PASS, actual desktop refusal and recovery.** Panel and canvas give the same R9 refusal and both Find buttons. The model, selected arc, Undo/Redo, dirty state and solver status remain the same. Each Find button focuses its own row and highlights its endpoint. Removing the Fix on point 3, entering Y16 and entering R9 succeeds. Studio shows two local motion directions for the released point. The R9 solve moves that free endpoint to approximately (19.479043, 15.641406) mm. The original anchor, remaining Fix, straight constraints and side tags are retained.
- **PASS, native geometry and persistence.** The 5 mm Extrude is one strict, genus-zero solid. At R12.5 it measures 2349.4493890637573 mm³. At R9 its chord is 15.650079391260231 mm and the native cylinder radius is 9.000000000026988 mm. The rebuilt and freshly reopened solid both measure 1796.715339935608 mm³, within 0.000000002 mm³ of the shoelace and circular-segment calculation. Undo and Redo restore the exact compared native documents. The independent actual straight-edge Fix diagnostic also passes through recovery and fresh Open.
- **PASS, feature checks.** Focused Studio 18/18, scoped ESLint, browser-driver syntax, Studio type check, Studio production build and diff check. The fixed and straight desktop runs each retained 1,254 source files through cleanup and recorded zero page or console errors.
- **FAIL, initial harness expectations.** This free non-tangent arc does not enter the existing finite point-drag path even after release. The corrected driver verifies the observed unchanged drag and uses the coordinate field for recovery. An intermediate attempt assumed R9 would hold the entire unlocked endpoint at the previous coordinate seed. The corrected check uses the actual retained constraints and independent radius, chord and volume invariants.
- **NOT_RUN.** A positive finite drag on a qualified tangent arc in this decision, full local suites and mobile. #763 retains its supported, compound motion check. The first mechanical CAD baseline stays at 8/10. Overall CAD completion is unmeasured.

```sh
# Node 22.19.0. Run one heavy gate at a time with local Chrome and Playwright.
# Use the pre-fix product for the baseline command.
D2063_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/fixed-arc-radius-conflict-browser.mjs "$OUT/baseline" --baseline
D2063_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/fixed-arc-radius-conflict-browser.mjs "$OUT/fixed"
D1994_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/fixed-edge-length-conflict-browser.mjs "$OUT/length-control"
node --check apps/cad-studio/test/fixed-arc-radius-conflict-browser.mjs
pnpm --dir apps/cad-studio test constraint-list panel-opposing-length
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```

Desktop receipt SHA-256 values are `b3e04ca79c91bf6ecd4d6efbb24cdddbbe945e7fbbb77233c27ed3246ff9c9cd` for the baseline, `fc168a343bb3197e06e398e852ed9b6f3c67ca162432c88b65e69895fe3fc068` for the corrected arc and `a6877c3974689c8cd8ff45af67826c6a1dc418f2bddee60af8d25d787ce31a8d` for the straight control.
