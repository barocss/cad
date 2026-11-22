# D1694 — Preview and apply sketch Fillet and Chamfer

P1 sketch authoring, rows 09 and 20. [Issue #21](https://github.com/barocss/cad/issues/21).

Select one sketch vertex to open Fillet or Chamfer. The commands use the Model icons and the Radius or Distance label in mm. Edits to the value update the outline preview. Apply commits a single sketch draft edit. Cancel and Escape dismiss the preview. Picking a different vertex invalidates the old candidate. Finish sketch still commits the edited profile to the native document.

The candidate uses the existing manual corner preparation and the sketch solver. Preview uses the same projected curves as the active sketch. The live owner, candidate and document must match at Apply. Passive constraint inspections leave an open corner edit in place.

## Verification

- **FAIL, parent UI parity.** The desktop parent `d60c9c8582853a6ee1aac5343f150ed453c930dd` displayed two direct-edit rows with Round and Chamfer. The old controls had no candidate preview or separate Cancel. The nine original geometry checks passed.
- **PASS, actual desktop Studio WebGPU.** On a 40 × 30 mm sketch and 10 mm Extrude, R6 shows a curved candidate and a 6 mm Chamfer shows a straight candidate. The original four draft points and document bytes remain before Apply. Switching commands or vertices retires the old candidate. Passive constraint inspection leaves the candidate visible. Cancel and held Escape preserve the selected sketch and geometry. A canceled Chamfer retains Redo for the preceding Fillet. Held Enter on Apply neither duplicates the edit nor finishes the sketch.
- **PASS, native results.** The R6 solid has a cylindrical wall of radius 6 mm and matches the analytic volume of 11922.743338823082 mm³. The 6 mm Chamfer gives 11820 mm³ and seven planar faces. Strict closed B-reps, retained side IDs, one-step sketch and document history, fresh Open and the bound-width refusal passed. An empty or 30 mm Chamfer value disables Apply. Saved Chamfer SHA-256 `3ee800b46e7258fda718a65197d3547849e8b1cf508390bab82c5c6897dbae55`.
- **PASS, desktop regressions.** The pinned line–arc fixture still accepts and edits R3/R4/R5 and refuses the attached outline and exhausted side IDs. Two sequential R4 edits on opposite corners keep the mobility controls. The four-round source still produces the native inset. A pointer drag from the ordinary rectangle vertex at (40, 0) to (35, 5) kept the point at (40, 0) and applied no Fillet.
- **PASS, local checks.** 76 focused Studio tests, Studio type check and production build, scoped lint, browser driver syntax and diff check.
- **NOT_RUN.** Multi-corner Apply, dedicated 2D value handles, mobile, live AI provider, full legacy browser suite and the held B06 PDF. First mechanical CAD remains 8/10. B06 remains 6/7. Overall completion remains unmeasured.

The first pinned browser replay timed out while leaving a refused sketch. Cancel brought a constraint row under the stationary pointer, and Escape first dismissed the resulting inspection. The corrected driver moves the pointer out of the panel before leaving the sketch. The pinned fixture passed the rerun. The original rectangle retains its redundant-constraint notice.

## Reproduction

Use Node 22.19.0, the workspace gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
pnpm --dir apps/cad-studio type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test constraints sketch-edit-identity sketchIds sketch-presentation sketch-constraint-mark-render
pnpm --dir apps/cad-studio build
D1691_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-browser.mjs "$OUT/corners"
D890_SOURCE_FROZEN=1 node apps/cad-studio/test/line-arc-round-browser.mjs "$OUT/pinned" --fixed
SKETCH_TWO_ARC_MOBILITY_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-two-arc-mobility-browser.mjs "$OUT/mobility"
D916_SOURCE_FROZEN=1 node apps/cad-studio/test/rounded-sketch-offset-browser.mjs "$OUT/inset" --drawn-inset
git diff --check
```
