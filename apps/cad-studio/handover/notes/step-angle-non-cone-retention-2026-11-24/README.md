# D1879 — Preserve non-cone STEP under active degree declarations

P0/P2 [row 13](../../roadmap-rows/13.md) and [row 30](../../roadmap-rows/30.md), [#277](https://github.com/barocss/cad/issues/277). Base `f2e747f9414beaefc1fe882895154fc22cd5e08b`.

[D1867](../step-cone-angle-unit-admission-2026-11-24/README.md) isolated angle admission to the directly owned context of a direct cone or its supported literal-zero offset. The remaining non-cone controls use one independently authored tetrahedron as a pure planar AP214 solid and a pure tessellated AP242 solid. Each has an active degree declaration and a millimetre or centimetre length assignment. The public import documentation now describes the radian default, malformed or unsupported unit refusal, and the two no-angle consumers. Product code is unchanged.

- **PASS, independent geometry and source.** The STEP fixture graph proves the angle and length units are assigned to the representation that owns the tested solid. The degree conversion factor is π/180. No surface in the fixtures consumes it. Degree and unitless inputs have identical native Kernel results for each of four cases. All results are strict solids with four faces. Physical bounds are 4 × 6 × 8 mm. The independent determinant gives volume 32 mm³ and centroid (1, 1.5, 2) mm.
- **PASS, actual desktop Studio.** All four imports open. The two millimetre files have one import node. The two centimetre files add one ×10 scale about the origin and display the explicit conversion notice. The unmodified closed meshes do not need repair. Actual native Save and fresh Open for both centimetre files match the pre-save geometry digest and preserve the STEP source. Six desktop states complete with zero page or console errors. Model additionally round-trips both millimetre files.
- **PASS, affected checks.** 39 Kernel tests, nine Model tests, scoped lint and Model type check. The existing direct and literal-zero cone controls still pass. A Sol High audit compared both decisions with the full scoped issue acceptance. The combined evidence qualifies the bounded issue for closure after exact CI and publication of the actual Studio scenes.
- **FAIL, aggregate documentation check.** The generated refusal page differs and public inventory rule IV001 reports 44 expected versus 46 actual direct members. The generator inputs and checked-in outputs are identical to the base. Neither failure concerns the updated STEP import page.
- **FAIL, first desktop check.** The planar file opened. The harness compared imported face names to their unqualified form. The final assertion recognizes the authored import prefix and still requires all four specific names.
- **NOT_RUN.** Whole local suites, other representation relationships, nonzero cone offsets, degree conversion for cone geometry, external readers and mobile. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

## Reproduce the affected checks

Run heavy jobs one at a time on Node 22.19.0. Use the existing local Chrome and Playwright and freeze the worktree during Studio.

```sh
node --test packages/barocss-cad/test/step-cone-angle.test.mjs packages/barocss-cad/test/step-cone-zero-offset.test.mjs packages/barocss-cad/test/step-tessellated.test.mjs
pnpm --dir packages/barocss-cad-model test step-offset-units
pnpm --dir packages/barocss-cad-model type-check
pnpm --filter @barocss/library-docs check:docs
D1879_SOURCE_FROZEN=1 node apps/cad-studio/test/step-cone-angle-browser.mjs "$OUT/studio" --non-cone-controls
```
