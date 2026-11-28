# D2160 — Require verified STL source corners for a reference circle

P4 [row 16](../../roadmap-rows/16.md) and [row 26](../../roadmap-rows/26.md) · [#273](https://github.com/barocss/cad/issues/273) · Base `dec549020e5ff936041fb3efc624bd6d03b1e3fa`.

The mesh reference circle now offers an explicit source requirement. Each visible endpoint must have current original STL corner occurrences before it can enter the three-point set. The existing evaluated-vertex mode remains available. Changing the requirement clears the partial or finished capture. A refused pick preserves already accepted points. The result is a session-only reference circle. It writes no geometry, history or file metadata.

The admitted profile is one currently open, unrepaired, single-piece imported STL within the existing preview bounds. Repeated file corners welded into one evaluated vertex retain their file-order labels and occurrence count, and count as one input point. Ambiguous evaluated endpoints and ownership changes remain refused. Reimport the original STL to establish file authority after a native Open.

## Verification

- **PASS, actual Studio and independent numeric and file checks.** The independently generated 32-triangle STL has a diamond bore and 155 mm³ of material. Three original inner-rim points give centre (0, 0, 2) mm, radius 5 mm, diameter 10 mm and normal (0, 0, 1). A binary corner read confirms each displayed group and weld count. A miss in the opening leaves A and B intact. Two triples on its noncyclic outside rim yield reference diameters 17.32 and 15.26 mm. The fourth point fails the first circle. Studio leaves hole diameter and circularity unmeasured.
- **PASS, correspondence and lifetime.** On the original block fixture, mm, cm and inch verify identical file ordinals with independently scaled coordinates. A duplicate pick leaves A and B in place. Changing the requirement, Reset, back to Measure, Done, Escape and document replacement clear the corresponding capture. Camera-only changes preserve it. The native secondary-weld control and same-context and fresh native Opens refuse source-required picks. Evaluated picks still work on the same documents. Actual Undo restores the previous import and Redo restores the exact ring Doc. Native Save/fresh Open preserve the ring and clear the measurement session.
- **PASS, existing regressions.** 26 Model and 29 Studio checks cover measurement, admissible and degenerate circle inputs, picking, import ownership and quantities. Existing desktop native arc, two-vertex diagonal and finite segment-to-face measurements pass. Studio types, scoped ESLint, driver syntax, production build and diff check pass. Final browser runs record zero frozen-source changes, console errors and page errors.
- **Corrected test failures.** The first ring run compared 155.00000000000003 mm³ to 155 by strict equality. It now uses an absolute 1e-9 mm³ test tolerance. The second run placed both rims at the same projected Top-view coordinates and correctly received an ambiguous endpoint refusal. The final independent fixture shears the bottom rim horizontally, with each section's area preserved, to exercise unambiguous visible endpoints.
- **NOT_RUN.** OBJ provenance, repaired or multi-piece STL source claims, mobile and full local suites. The existing fallback remains available where the original source identity cannot be established. This completes the selected file-provenance research and its finite supported desktop workflow. First mechanical CAD is 8/10 accepted. Overall completion is unmeasured.

```sh
MESH_CIRCLE_FROZEN=1 node apps/cad-studio/test/mesh-circle-browser.mjs "$OUT/baseline" --stl-sources
MESH_CIRCLE_FROZEN=1 node apps/cad-studio/test/mesh-circle-browser.mjs "$OUT/final" --source-required
MESH_CIRCLE_FROZEN=1 node apps/cad-studio/test/mesh-circle-browser.mjs "$OUT/ring-separated" --source-ring
D1373_SOURCE_FROZEN=1 node apps/cad-studio/test/native-arc-measure-browser.mjs "$OUT/native-arc-measure"
D1015_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-preselected-vertex-browser.mjs "$OUT/measure-preselected-vertex"
D742_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-segment-face-browser.mjs "$OUT/measure-segment-face"
pnpm --dir packages/barocss-cad-model test mesh-import mesh-circle measure
pnpm --dir apps/cad-studio test mesh-circle mesh-import-ownership vertex-pick measure-quantity
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
