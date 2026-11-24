# D1902 — Replace a held Chamfer edge before an independent Through Hole

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#20](https://github.com/barocss/cad/issues/20). Base `68d19426bb16a4562f8a73ae9805b34489089f08`.

Offer the existing History edge replacement when an original rectangular Extrude has one held constant Chamfer and the last feature is an independent top Through Hole. Read the original Chamfer parent with the existing Worker reference slot. The selected line must have the same full name, native plane supports and raw endpoints on both bodies. Use the parent line for the saved signature. Require clearance for the selected Chamfer strip. The explicit Apply evaluates the whole chain before committing.

- **FAIL, previous desktop Studio.** The held Chamfer was visible in References, and the surviving Through Hole kept output `b3`. History had no Replace edge action. The open document and native solid remained intact.
- **PASS, desktop Studio.** Six WebGPU states for the downstream Hole case and eight terminal Fillet/Chamfer control states passed. Clicking the Hole rim refuses. Clicking the original top lip previews edge `n1.side[e1]|n1.top`. Refusal and Cancel preserve the document, both history controls and the native shape. Explicit Apply restores the same Chamfer feature. Undo restores the hold. Redo, native Save and fresh Open preserve the repaired Chamfer and the original Hole.
- **PASS, independent expected geometry.** The `80×40×10` mm stock has an R2 through-hole centered at `(20,0)` mm. Its two inward native half-cylinders and full Hole node stay intact. The 3 mm bevel removes `360` mm³; the verified volume is `31874.33629385641 → 31514.33629385641` mm³. The strict result has one shell of genus 1, 9 faces, 11 loops, 42 coedges, 21 edges and 14 vertices. Its centroid is `(20, 0.21704407594754008, 4.954306510326836)` mm within the test tolerance.
- **PASS, affected checks.** Fifteen focused Studio tests, lint and the Studio type check and production build. The native edge check rejects duplicate owners, a line shortened below signature rounding, a blind Hole and a Through Hole too close to the bevel. Reversed line endpoints retain the same valid owner.
- **NOT_RUN.** Whole local suites, other downstream features, Add/Finish UI paths, groups, varying Fillet, mobile and live providers. #20 stays open. First mechanical CAD is 8/10. Whole-product completion is unmeasured.

```sh
pnpm --dir apps/cad-studio test held-finish-replacement history-references
pnpm --dir apps/cad-studio build
D1902_SOURCE_FROZEN=1 node apps/cad-studio/test/held-chamfer-through-hole-browser.mjs "$OUT/base" --baseline
D1902_SOURCE_FROZEN=1 node apps/cad-studio/test/held-chamfer-through-hole-browser.mjs "$OUT/studio"
D998_SOURCE_FROZEN=1 node apps/cad-studio/test/split-finish-reference-browser.mjs "$OUT/terminal" --repick-fixed --native-save
git diff --check
```
