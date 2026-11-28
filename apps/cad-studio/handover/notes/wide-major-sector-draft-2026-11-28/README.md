# D2151 — Draft exact major circular sectors above 270°

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `1e657383a4c9a53f24f1cad5033872bc4eb2e908`.

Signed Draft Extrude now accepts an original equal-radius sector with a major arc above 270°. The exact endpoint relation and two original radial walls identify the source. The stable ratio uses the sum in its numerator near a full turn. The producer requires the original and drafted half arcs to stay distinct and both radial trims to survive. Circle, cone and parabola geometry use the existing native representation.

## Verification

- **PASS, baseline and actual desktop.** The previous Studio refuses the 306.869898° case at +10°. The candidate previews, cancels and accepts it at a 10 mm radius and height. History refuses +20° and −40° without changing the original draft. The −30° edit applies. Undo/Redo and native Save/fresh Open preserve the six-face solid. Both desktop runs freeze 1,280 files and report no source changes, page errors or console errors.
- **PASS, independent geometry.** Green and section integrals give 2,057.712429272436 and 5,087.767988706922 mm³ for +10° and −30°. Native volumes agree within 1.2e−11 relative and centroids within 1e−8 mm. Two rational charts retain the exact circle at their internal knot, and their parabola joins stay on the radial planes and cone. A 354.275° source keeps distinct authored endpoints in the near-full control. Exact translated, rotated and reversed source endpoints pass. Closely spaced, radius-mismatched, half-turn and collapsed controls retain their expected admission or refusal. Three tessellation resolutions have zero open edges. Fourteen existing sector digests match the base. The reopened −30° digest is `c1f4eb79b0bf369032d5b4c7c711002a8cdacc047891d9752de6d76a39d0ea2c`.
- **PASS, affected checks and geometry review.** 96 Kernel, 3 Model and 99 Studio checks, affected types, scoped ESLint, driver syntax, diff check and Studio production build pass on Node 22.19.0. The independent review confirms the representable angle range and closed cap.
- **NOT_RUN.** Display approximation improvement, general face Draft, external CAD, mobile and full local suites. #14 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/baseline" --baseline --wide-major
node packages/barocss-cad/scripts/tool.mjs build:fast
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/candidate" --wide-major
node --test --test-concurrency=1 packages/barocss-cad/test/{drafted-extrusion,drafted-quarter-disk,drafted-half-disk-outward,drafted-circular-segment,drafted-oblique-circular-segment,drafted-major-circular-segment,part-model}.test.mjs
pnpm --dir packages/barocss-cad-model test extrude-draft-binding offset-drafted-wall extrude-reviewed-draft
pnpm --dir apps/cad-studio test draft extrude proposal-review-availability
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
