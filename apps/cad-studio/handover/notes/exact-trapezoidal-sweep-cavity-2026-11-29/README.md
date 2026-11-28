# D2266 — Preserve a rectangular cavity inside an exact closed trapezoidal Sweep

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#10](https://github.com/barocss/cad/issues/10) · Base `f34f88ab3`.

- **FAIL, base capability.** Headed Studio used the original R20 four-quarter rail and refused the authored trapezoid with one offset rectangular cavity before Apply. The original sketch and rail stayed accepted.
- **Decision.** Admit one axis-aligned rectangular loop within the existing straight radial trapezoid. Share the rectangular loop gate with the existing duct. Check all four cavity corners against every inset side of the convex trapezoid, including the sloping wall. Apply the same outer bounds-centre translation to both loops. Keep the authored order and side tags. The existing native hollow Revolution and chart binding produce one closed exterior shell plus one inward cavity shell.
- **PASS, independent native evidence.** The original void spans [0.5, 1.5] × [2, 4] mm in authored sketch coordinates. The width edit from 4 to 6 mm gives exterior volumes 704π and 920π mm³, and signed cavity volumes −76π and −72π mm³. The two native net volumes are 1,972.920186454390 and 2,664.070570244145 mm³. Independent centroid and paired shell quadrature agree. There are sixteen faces, thirty-two edges and sixty-four coedge charts. Authored winding, radial-Y and whole saved native readback pass. Sloping-wall contact and crossing, sub-tolerance wall clearance, unsupported cavity shapes and axis contact refuse.
- **PASS, actual desktop.** Preview and Apply with the original authored hole. Studio refused a width edit crossing the sloped wall and preserved the accepted document. A valid upstream width edit rebuilt the cavity. Undo/Redo and project Save, Close and fresh Open retained the same original cavity owners and native geometry. The reopened Y section shows the two cavity openings in the cut plane. The final run retained 1,308 source pins and no console errors.
- **FAIL, during development.** The first focused run found the existing one-shell result gate and an invalid test tag list. The first desktop candidate reached a valid applied native solid but the driver expected an unqualified shell ID. The final checks cover the admitted shell count, valid negative fixtures and Studio owner-qualified shell IDs.
- **PASS, automated.** Node 22.19.0 passed 295 Sweep, 32 Model and 10 Studio checks. The full kernel passed 3,346 with 0 failures and 2 existing skips. Kernel, Model and Studio type checks, changed-file lint and the production Studio build passed.
- **NOT_RUN.** Mixed arc cavities, multiple trapezoidal cavities, general closed rails, mobile and live models. Wider Sweep acceptance remains open.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
(cd packages/barocss-cad && node --test test/*sweep*.test.mjs)
(cd packages/barocss-cad && node --test test/*.test.mjs)
node packages/barocss-cad-model/scripts/test.mjs sweep-history-edit sweep-agent-remap sweep-path-history toolset tool-contract
(cd apps/cad-studio && node scripts/test.mjs sweep-path-geometry sweep-path-feedback edge-continuity-scope)
bash "$OUT/desktop.sh" baseline baseline
bash "$OUT/desktop.sh" fixed-owner
git diff --check
```
