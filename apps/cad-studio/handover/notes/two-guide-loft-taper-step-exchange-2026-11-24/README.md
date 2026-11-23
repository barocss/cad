# D1838 — Verify AP214 exchange of the unequal two-guide Loft

P5 rows [07](../../roadmap-rows/07.md) and [08](../../roadmap-rows/08.md), P2 row [13](../../roadmap-rows/13.md), [#16](https://github.com/barocss/cad/issues/16). Base `337e163d41d44cea80650a010ef42d6bd0bdd4cb`. Extend the [D1280 Studio fixture](../two-guide-loft-unequal-sections-2026-11-15/README.md).

- **PASS, actual desktop Studio WebGPU.** Apply two guides to 10 × 6 and 14 × 4 mm rectangles at Z0 and Z12. Export the first part. Change the second guide middle X from 16 to 18 mm, then verify Undo, Redo and native Save/fresh Open. Export the new part. The STEP panel shows one AP214 solid in millimetres and the native-history loss. The two export calls retain their working documents. The driver captures the generated STEP blobs at the final output action.
- **PASS, independent STEP reader.** Both files resolve one closed shell with 6 faces, 12 edges, 8 vertices and 24 oriented edge uses. The two planar caps lie at Z0 and Z12 with outward normals and exact corners. The four polynomial B-spline walls have degrees `(1,3)`; the four upright edges have degrees `2,2,3,3`. The reader checks 17 heights against the analytic rectangles. Each file fails verification against the other guide control, despite matching topology and caps.
- **PASS, actual fresh STEP Open.** Each exact file opens as one strict solid. Studio mass and independent section integration agree on `29016/35` and `161272/175` mm³ within 1e-8 mm³. Native checks match the authored centroid, inertia, both guiding edges and the four walls. The imported part retains exact STEP bytes and follows the documented geometry-only round trip.
- **FAIL, display parity.** The original refined packets show 2080 and 4224 triangles, with error bounds 0.00838555 and 0.00945968 mm. Neither reopened STEP uses a refined Loft packet, and its visible curves are faceted. This is a display gap with the native geometry retained.
- **PASS, affected checks.** 29 Model tests, 16 Studio tests, scoped ESLint, syntax and diff check. Eight final desktop captures, 1209 frozen files and zero console, page or source errors. The source-only probe initially used a duplicate section height frame, and the first desktop assertion expected a singular body label. Corrected fixture and harness checks verified the supported behavior.
- **NOT_RUN.** Third-party STEP readers, OS transfer of the generated STEP, imported face parameter-curve continuity, WebGL2, mobile and full local suites. #16 stays open for broader STEP exchange. First mechanical CAD remains 8/10 accepted. Whole-product completion is unmeasured.

```sh
D1280_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-taper-browser.mjs "$OUT/studio" --step --check-display
python3 -BI apps/cad-studio/test/two-guide-loft-step-oracle.py "$OUT/studio/initial-taper.step" 16
python3 -BI apps/cad-studio/test/two-guide-loft-step-oracle.py "$OUT/studio/edited-taper.step" 18
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test step-export-preparation display-mode
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test step-export-scope api-loft-guide loft-guide-command
pnpm exec eslint apps/cad-studio/test/two-guide-loft-taper-browser.mjs
git diff --check
```
