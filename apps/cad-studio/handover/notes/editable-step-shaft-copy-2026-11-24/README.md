# D1843 — Reconstruct a two-step shaft from STEP

P5 [row 31](../../roadmap-rows/31.md) and P2 [row 13](../../roadmap-rows/13.md), [#320](https://github.com/barocss/cad/issues/320). Base `92ad4170200f6e9fb85e0614955b877e9a33cb23`.

The editable copy review now accepts a writer-profile, single millimetre STEP solid with two coaxial cylindrical stages and one sharp shoulder. The axis starts at the origin and follows +Z. The two end seam vertices supply the radii and the three axial levels supply the lengths. These values propose a new native Shaft feature. Strict inspection and the same full raw STEP graph comparison as D1841 certify it. The shaft review exposes only the numeric copy.

- **PASS, geometry and source.** Rename the STEP records and remove labels before actual Chrome WebGPU Open. The review identifies Shaft and writes a separate BCAD containing only that new feature. The exact STEP source remains unchanged, SHA-256 `453c1234bfec25321973d76d4ec732a6f2230b4c8c03b9bda8dea1460902fcbb`. The original and the copy each have four outward half-cylinder faces, four planar end halves, two planar shoulder halves and one genus-zero solid. Independent cylinder formulas give volume 4674.689868542 mm³ and centroid Z 7.935483871 mm for Ø20 × 12 and Ø12 × 8. Native position, orientation, radii, spans, volume and centroid meet `1e-8` in millimetre units.
- **PASS, existing feature edits.** Change stage one length from 12 to 15 mm and stage two diameter from Ø12 to Ø14. The shoulder moves to Z15, the axis stays fixed, and volume becomes 5943.893300592 mm³. Equal diameters are refused with the exact kernel reason and the last good shape stays accepted. Undo, Redo, Save and fresh Open preserve one native Shaft feature. Its second length can then change from 8 to 10 mm with the shoulder held at Z15 and volume 6251.769380644 mm³.
- **PASS, boundaries.** Studio refuses a shifted STEP shaft with the same counts. Focused tests also verify the reverse diameter order and refuse rotation, a third stage, chamfer and fillet. The complete D1842 plate review, numeric edit and named-driver flow also passes on the current build.
- **PASS, affected checks.** 11 Kernel, 14 Model and 65 Studio focused tests. Model types, Studio types and production build, scoped ESLint and Git diff check. Both desktop runs record 26 states with zero page, console and source changes. All 1,207 frozen files agree per run.
- **FAIL, initial harness.** The exact equal-diameter reason was inside a closed Kernel detail disclosure. The final run opens that disclosure before checking the message.
- **NOT_RUN.** Agent delivery, non-mm and alternate STEP representations, shaft named drivers, external reader, other display backends, mobile and full local suites. The native cylinders are exact. Visible circular rims are still faceted in the current display mesh. D1844 addresses that viewport issue. #320 stays open. First mechanical CAD remains 8/10 and whole-product completion remains unmeasured.

```sh
node --test packages/barocss-cad/test/{r12c-shaft,step}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs editable-step-copy step-units
pnpm --dir apps/cad-studio test editable-step-preparation step-export history-feature-editor work-ownership
EDITABLE_STEP_COPY_SOURCE_FROZEN=1 node apps/cad-studio/test/editable-step-copy-browser.mjs "$OUT/shaft" --shaft
EDITABLE_STEP_COPY_SOURCE_FROZEN=1 node apps/cad-studio/test/editable-step-copy-browser.mjs "$OUT/plate"
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
