# D2273 — Share an original Box depth proposal with one browser grant

P5 [row 04](../../roadmap-rows/04.md) and [row 31](../../roadmap-rows/31.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `e05f11805`.

- **FAIL, base capability.** Actual Chrome reported the original two Boxes and exposed the optional width control. Depth had no browser grant or registered tool.
- **Decision.** Register `cad_part_propose_box_depth_match` only for an explicit one-use depth grant on two original Boxes. Reuse the native endpoint and revision checks from the local Agent. Resolve the second Box's minimum or maximum Y side. Keep the same proposal author and Studio approval gate. Changing to a width grant retires the old depth tool.
- **PASS, actual production Studio.** Chrome 158.0.8127.89 used WebGPU and the actual `document.modelContext` API. The published schema exposes both Y choices and rejects unknown fields. Stale revisions and wrong owners refuse. The maximum-Y candidate shows +756 mm³ and user Reject preserves the original document. The minimum-Y proposal shows +396 mm³ and, after explicit Accept, changes depth from 8 to 13.5 mm with the opposite face fixed at Y=−4.5. Undo, Redo and fresh project Open preserve approval ownership. Fresh Open begins with no browser grants.
- **PASS, native and automated.** The saved approved part is strict valid with an exact 972 mm³ and centroid [8.25, 2.25, 5.125]. The second Box's entire native record matches. Node 22.19.0 passed 31 Model and 19 Studio cases. Model and Studio types, changed-file lint and the production Studio build passed. The first built driver resolved the wrong output directory. The first standalone native proof bundle needed the Studio module root. The corrected checks passed with zero browser errors and downloads.
- **NOT_RUN.** L2 direct browser edits, external agent clients, deployment, mobile and the full local kernel suite. The current browser approval policy and the original issue's remaining policy decision stay open.

```sh
CAD_STUDIO_DIST="$BASE_DIST" bash "$OUT/built.sh" desktop-baseline --baseline
CAD_STUDIO_DIST="$OUT/dist" bash "$OUT/built.sh" desktop-fixed-final fixed
bash "$OUT/validate.sh"
git diff --check
```
