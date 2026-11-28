# D2150 — Draft exact reflex circular sectors below 270°

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `4db7a3ec059b9a685b580f152a790928b669fb89`.

Original nonorthogonal radial sectors with a major arc between 180° and 270° now accept signed Draft Extrude. Admission proves exact equal radii and a negative dot and cross product between the authored endpoint vectors. The producer takes the major arc's bisector and the stable signed half-angle ratio. The exact radial parabolas and original face roles survive the draft.

## Verification

- **PASS, baseline and actual desktop.** The old Studio refuses the original 233.130102° profile at +10°. The candidate previews and cancels, then applies +10° at 10 mm radius and height. History refuses +30° and −84° while retaining that part. The −45° edit applies, Undo/Redo restores both accepted states and native Save/fresh Open preserves the final boundary. Both desktop runs freeze 1,280 files and report zero source changes, page errors and console errors.
- **PASS, independent geometry.** Closed-cap Green integrals and the independent desktop section formula agree at 1,536.554455361887 and 6,198.854807340992 mm³ for +10° and −45°. Native volume agrees within 9.6e−12 relative. The centroid agrees within 1e−8 mm. A +20° control has one rational span per top arc and two spans per cone support chart. All three signs and sizes retain a strict six-face solid, exact radial seams and closed tessellation at three resolutions. The rotated fixture retains its exact authored endpoints. Ten historical native digests for the quarter, acute, obtuse, 270° and rotated 270° sectors match the base. The reopened −45° boundary digest is `9b2d606866db7289b6ea8d1c46558cb35fc88ab796d254e212ac44f715e8b24d`.
- **PASS, affected checks and geometry review.** 94 Kernel, 3 Model and 99 Studio checks, affected types, scoped ESLint, driver syntax, diff check and the Studio production build pass on Node 22.19.0. Independent review verifies the signed bounds, exact source test and retained cone chart.
- **FAIL, corrected control.** The first inherited unsupported-arc check still used a 253.739795° source, which the new feature admits. The refusal test now uses 306.869898° and passes. Its one-ULP radius and collapse controls also pass.
- **NOT_RUN.** Major angles above 270°, external CAD, neutral exchange, mobile and full local suites. #14 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/baseline" --baseline --major
node packages/barocss-cad/scripts/tool.mjs build:fast
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/candidate" --major
node --test --test-concurrency=1 packages/barocss-cad/test/{drafted-extrusion,drafted-quarter-disk,drafted-half-disk-outward,drafted-circular-segment,drafted-oblique-circular-segment,drafted-major-circular-segment,part-model}.test.mjs
pnpm --dir packages/barocss-cad-model test extrude-draft-binding offset-drafted-wall extrude-reviewed-draft
pnpm --dir apps/cad-studio test draft extrude proposal-review-availability
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
