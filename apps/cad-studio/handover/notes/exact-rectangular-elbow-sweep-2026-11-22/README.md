# D1674 — Sweep an aligned rectangular section through a tangent elbow

2026-11-22 · P5 row 07 and kernel row 30 · [#10](https://github.com/barocss/cad/issues/10) · Base `282de207d0fb807e49b15c098178724e03230fd0`

Exact line–arc–line Sweep accepts a rectangle with one axis along the bend radius and one perpendicular to the bend plane. The rectangle is centred on the path. Its radial half-width must clear the bend axis. The lead, bend and tail share two verified rectangular faces. The kernel removes the interior faces and binds the native coedges on the annular planes and cylinders to their own surface charts. Studio displays the resolved sketch size in Sweep History. The saved Exact mode is the same.

- **FAIL, base.** Exact line–arc–line returned `CAPABILITY` for the 4 × 6 mm rectangle on the R20 mm quarter elbow. Faceted built at 1328.741322406667 mm³. Separate exact lead, bend and tail controls totalled 1329.982236861550 mm³ and agreed with area times path length.
- **PASS, affected checks.** Kernel 38, Model 23 and Studio 12 tests. Kernel fast build and types, Model types, scoped lint, driver syntax, Studio production build with types and Git diff check passed. The native suite checks aligned axes, a long oblique 120° elbow, actual radial clearance, rolled and holed profiles, and axis contact.
- **PASS, actual desktop Studio WebGPU and local MCP.** Pick the rectangular sketch and Direct rail, preview and apply Exact line–arc–line. Measure the four native edges at each joint. Studio reads 0° at all eight. Edit the profile via Sweep History. The 40 mm width that reaches the bend axis is refused and leaves the accepted part intact. Width 4 → 6 mm, Undo, Redo, Save and fresh Open pass. History displays the current 6 × 6 mm section. The local MCP describes the rectangular input and dry-runs it without changing file bytes. Studio approval reproduces the native geometry from direct creation. The rectangular, circular elbow and closed circle runs record 10, 12 and 11 captures respectively. The circular elbow and closed circle match their earlier native digests, volumes and topology counts. The rectangular flow checked 1,173 frozen files with zero changes or page or console errors.
- **PASS, native shape.** One genus-zero shell has 14 faces, 28 edges and two exterior planar caps. The R20 mm bend contains two annular planes and two cylinders at R ± half the radial width. The cap points, supports and volumes match the independent oracles. Volume is 1329.982236861550 mm³ at 4 × 6 mm and 1994.973355292326 mm³ at 6 × 6 mm. Native quadrature and the worker agree with the area-times-length calculation. The largest sampled pcurve gap is 7.94e-15 mm and normal angle at a seam is 1.69e-14°. For the first case, the four coplanar joins have zero sampled curvature jump and the four plane-to-cylinder joins give 1/18 or 1/22 mm⁻¹. The reopened digest is `391bde65e85d057d2a33467881cae7a53f8f06a29d5b3c52991c4fabf576ec7b`. Direct creation and local Agent approval at 4 × 6 mm share the digest `087704fc324791a2d507d1de2dbfa5f7bca042b337f4ed9261a925bf6b02230d`.
- **FAIL, first type check.** TypeScript inferred the joined path without its optional tail length. An explicit joined path type fixed the error. The subsequent type check passed without a change to emitted JavaScript.
- **FAIL, first desktop attempt.** The test assumed that a tagged rectangle reopens with an ordinary width field. Studio exposes its constrained edge lengths. The final test edits the actual edge length and passes.
- **FAIL, inherited.** The aggregate kernel code-shape check reports the same excess at base and after the change in `cylindrical-bore.ts` (3), `thicken-cylinder.ts` (3) and `thicken-planar.ts` (2).
- **Observed display limitation.** The viewport outline along the bend is visibly segmented. The native cylindrical supports and both tangent joints pass the geometry checks above.
- **NOT_RUN.** Full local suites, WebGL2, arbitrary roll, holed mixed Sweep, downstream Boolean and Fillet on the rectangular elbow, and live provider. Issue #10 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and output paths outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/{exact-rectangular-elbow-sweep,exact-elbow-sweep}.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-elbow-sweep,exact-closed-circle-sweep,exact-elbow-sweep,exact-tangent-sweep,exact-arc-sweep,exact-straight-sweep,arc-sweep-bore-fillet,sweep-solid}.test.mjs
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/src/ui/SweepHistoryInputs.tsx apps/cad-studio/test/{sweep-path-geometry.test.ts,exact-rectangular-elbow-sweep-browser.mjs}
node --check apps/cad-studio/test/exact-rectangular-elbow-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display arc-sweep-mixed-display arc-sweep-exterior-detail sweep-agent-remap direct-sweep-source-ids sweep-history-edit sweep-path-history
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm --dir apps/cad-studio build
D1674_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-elbow-sweep-browser.mjs "$OUT/rectangular"
D1671_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-tangent-sweep-browser.mjs "$OUT/elbow" --elbow
D1673_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs "$OUT/closed-circle"
git diff --check
```
