# D2149 — Draft an exact 270° circular sector

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `bb006a40bba276af4039c6c420d1b3103572454f`.

The Draft Extrude producer admits an original three-quarter disk with two exact radial lines and a 270° arc. It proves the clockwise quarter relation between the authored endpoint vectors and uses the major arc's bisector. Two rational cone charts meet the planar walls along exact parabolas. The original centre, endpoints and face roles remain exact.

## Verification

- **PASS, baseline and actual desktop.** The previous Studio refuses the 270° profile on the nontangent joint. The new Studio previews and cancels +10° at 10 mm radius and 10 mm height, then accepts the same values. History refuses +30° and −70° without changing the part. It accepts −30°. Undo/Redo, native Save and fresh Open preserve the original sides and the accepted boundary. Baseline and candidate each freeze 1,280 files with zero source changes, page errors and console errors.
- **PASS, independent geometry.** At height `z`, offset `d = z tan θ` and `q = sqrt(R²−2Rd)`. Subtract the clipped right-angle notch from the full circle of radius `R−d`. Integrating gives 1,799.724375994307 and 4,655.615714628948 mm³ for +10° and −30°. Native volume agrees within 6.1e−12 relative. The reopened −30° boundary digest is `cf34f63889ab727c2b9ee248844482b5d743fbcea4d5c0ae12a3e4b7986af4dc`. The Kernel controls also verify the independent centroid, the two conic incidences, the internal rational knot, a −60° wide cone, all original endpoint coordinates and the rotated/reversed source. Three tessellation resolutions close without open edges. The existing lower and upper collapse controls, unmatched quadrant refusal and selected historical native hashes pass.
- **PASS, affected checks.** 92 Kernel, 3 Model and 99 Studio checks, affected types, scoped ESLint, driver syntax, diff check and Studio production build pass with Node 22.19.0. The independent geometry review confirms the two signed collapse conditions and the two-span construction.
- **NOT_RUN.** Other major angles, new exchange profiles, external CAD, mobile and full local suites. #14 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/baseline" --baseline --reflex
node packages/barocss-cad/scripts/tool.mjs build:fast
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/candidate" --reflex
node --test --test-concurrency=1 packages/barocss-cad/test/{drafted-extrusion,drafted-quarter-disk,drafted-half-disk-outward,drafted-circular-segment,drafted-oblique-circular-segment,drafted-major-circular-segment,part-model}.test.mjs
pnpm --dir packages/barocss-cad-model test extrude-draft-binding offset-drafted-wall extrude-reviewed-draft
pnpm --dir apps/cad-studio test draft extrude proposal-review-availability
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
