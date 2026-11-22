# D1737 — Set a common radius on saved sketch Fillets with different sizes

P1 Sketch, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `af75fb8f9188d69161e82cfdca043027088cbddb`.

Select supported saved orthogonal Fillet arcs on one independent outline. The existing Fillet editor opens with an empty Radius field for different starting values. One entered radius or one handle motion previews the same target on all selected arcs. Preview uses the checked single-Fillet edits on local geometry. Apply a larger original radius first so that shrinking it can free a shared carrier before a smaller arc grows. Publish one complete sketch edit. Dragging back to the start restores the prior draft.

- **FAIL, base capability.** Studio opens a strict 10 mm extrusion from a saved R4 convex and R14 reflex pair. Both actual arc picks are visible and the shared Fillet editor is absent. The original fixture was derived from the Studio-authored R6 pair with independently checked coordinates and exact native radii.
- **PASS, desktop Chrome / WebGPU.** The mixed selection starts with no inferred value or alert. R13 refuses without changing the saved sketch. Numeric R12 in both selection orders and a real drag produce the same preview. Returning to the zero-drag position restores the empty field. Cancel, Apply, sketch and document Undo/Redo, Save and fresh Open preserve the intended authored state and geometry.
- **PASS, independent native geometry.** Strict validity, both face turns and stable side IDs pass. The starting volume is 20386.283305884594 mm³ and the target volume is 20000 mm³. The 25 mm carrier has 1 mm of straight line after both constraints become R12. The cylinder centers are [50, 28] and [26, 27] mm. Fresh Open native hash `34c14e53b4467233eb3adb69553375b1f76f9ac3e3cceedcd74903ec0caeb06f`. The focused Model test covers both source orders, equal-size identity, unsupported selections and a late refusal with an intact source.
- **PASS, affected checks.** 14 Model and 53 Studio tests. Scoped ESLint, Model types, Studio production build and types, driver syntax and Git diff check. Desktop same-size Fillet and Chamfer controls pass. The three desktop flows record 29 checkpoints, zero source changes and zero console or page errors.
- **FAIL, recovered test setup.** An early setup click selected the same Fillet twice. At the smaller framing scale the R4 pick landed on an endpoint handle. The final run uses the fitted sketch scale and verifies both picked arc IDs before testing the group.
- **NOT_RUN.** Mixed Chamfer sizes, other sketch and Fillet families, mixed-size Agent proposals, WebGL2, mobile, full local suites, and live providers. First mechanical CAD remains 8/10. Overall completion is unmeasured. Issue #21 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
D1737_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/base" --mixed-fillet-radii --expect-no-group-editor
D1737_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/verified" --mixed-fillet-radii
D1726_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/fillet-control" --resize-fillets
D1728_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/chamfer-control" --resize-chamfers
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sketch-fillet-edit sketch-chamfer-edit sketch-corner-batch
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test constraint-list constraints draft-sketch-history sketch-presentation
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
