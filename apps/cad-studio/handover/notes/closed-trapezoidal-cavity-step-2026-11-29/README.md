# D2272 — Qualify STEP exchange of a tapered ring and report omitted Direct geometry

P2 [row 13](../../roadmap-rows/13.md) and [row 30](../../roadmap-rows/30.md) · [#16](https://github.com/barocss/cad/issues/16) · Base `52ea66760`.

- **PASS, original geometry exchange.** Both D2266 authored widths open as one strict native STEP solid with two closed shells, sixteen faces and sixty-four coedges. Each export has one `BREP_WITH_VOIDS`. The cavity and exterior retain six cylindrical, eight planar and two conical half-faces. Independent volume and area give 1,972.920186454390 / 2,664.070570244145 mm³ and 2,970.788418767932 / 3,251.128387955403 mm². Native STEP readback and actual Studio export/Open agree with the independent formulas.
- **FAIL, original loss report.** The source contains one visible Direct circular rail. The STEP import retains the solid and has no Direct objects. The original loss report lists native history and parameters, but omits Direct geometry.
- **Decision.** Report omitted Direct curves and surfaces for a source with Direct objects or a shown occurrence with them. The ordinary worker wire strips those objects. Carry the presence flag in STEP request metadata and add the loss once on the prepared reply. The direct Model exporter reports the same loss. No Direct payload needs to cross the worker boundary for this report.
- **PASS, actual desktop.** The final Studio loss report lists the original history, parameters and Direct geometry before capture. Both generated STEP files match the originals byte for byte after normalizing only their timestamp. The two geometry sections match exactly. Both imports agree with native area, volume and topology. Saving and opening an actual browser project retains the width-6 imported B-rep and its visible cavity section. The final desktop run froze 1,308 source files, with no console errors and no browser downloads.
- **PASS, automated.** Node 22.19.0 passed 16 Model and 21 Studio checks. Model and Studio types, changed-file lint and the production build passed. The first Model-only candidate exposed the missing worker metadata in actual Studio. The final check covers the normal worker path.
- **NOT_RUN.** External CAD consumers, broad STEP geometry families, full local kernel suite, mobile and live models.

```sh
node "$OUT/native.mjs"
bash "$OUT/desktop.sh" baseline baseline
bash "$OUT/desktop.sh" fixed-metadata fixed
bash "$OUT/validate.sh"
git diff --check
```
