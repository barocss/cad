# D2142 — Draft exact obtuse circular sectors

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `f532cf9e0e7f6a851a757d3569af00d2acc60752`.

An original obtuse minor arc with two exact equal-radius endpoints now takes either sign of Draft Extrude. The producer proves the endpoint relation from the authored coordinates. It computes the half-angle cotangent as `s/(1−c)` for the obtuse frame. This avoids cancellation near a half turn. Each radial wall retains its exact conic intersection. A wide cone chart uses the existing multi-span rational arc representation.

## Verification

- **PASS, baseline.** Actual desktop Studio refuses the 126.869898° source at +10° Draft with the nontangent-joint diagnostic, leaving the original sketch intact.
- **PASS, actual desktop.** The 10 mm radius and 10 mm height fixture previews, cancels and applies at +10°. History refuses +30° and −84° without changing the accepted document. The −45° edit applies, Undo/Redo restores both states, and native Save/fresh Open retains the exact boundary. Both desktop runs freeze 1,279 files with zero source changes, page errors or console errors.
- **PASS, independent geometry.** The section uses area `(R−d)²(a−atan2(d,q)) + d²/2 − dq`, where `a` is the half-angle, `d` is the offset and `q = sqrt(R²−2Rd)`. Integration gives 773.5198964485744, 1,515.677845967478 and 4,368.499298670564 mm³ for +10°, −10° and −45°. The native values agree within 3.1e−11 relative and the three centroid coordinates agree within 1e−8 mm. At −45° each cone chart spans 93.434949° with five U control rows across two quadratic rational spans. Strict checks verify the two exact radial seams, original endpoints, one six-face solid and watertight tessellation at three resolutions. The reopened −45° boundary digest is `906a64716c6f4d5ee8998afe91d2b5b1e3d222fbc4eaf6e8f8e589b8bd8594c8`.
- **PASS, affected checks and independent review.** 90 Kernel, 3 Model and 99 Studio tests, types, scoped lint, driver syntax, diff check and production build on Node 22.19.0. Six signed quadrant and acute control digests match the previous producer. Substituting that producer fails the obtuse regression.
- **FAIL, corrected measurement assertion.** The initial wide-angle control expected an absolute discrepancy below 1e−7 mm³. The native quadrature difference is 1.33e−7 mm³ at 4,368.5 mm³. The final test uses 1e−10 relative plus its independent centroid and exact support checks. No production tolerance or quadrature setting changed.
- **NOT_RUN.** Major-arc source sectors, explicit pcurve creation, external CAD and neutral formats, mobile and full local suites. #14 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run desktop and affected checks under the heavy gate.
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/baseline" --baseline --obtuse
node packages/barocss-cad/scripts/tool.mjs build:fast
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/candidate" --obtuse
node --test --test-concurrency=1 packages/barocss-cad/test/{drafted-extrusion,drafted-quarter-disk,drafted-half-disk-outward,drafted-circular-segment,drafted-oblique-circular-segment,drafted-major-circular-segment,part-model}.test.mjs
pnpm --dir packages/barocss-cad-model test extrude-draft-binding offset-drafted-wall extrude-reviewed-draft
pnpm --dir apps/cad-studio test draft extrude proposal-review-availability
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
