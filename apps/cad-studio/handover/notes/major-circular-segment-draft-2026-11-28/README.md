# D2105 — Draft an original major circular segment

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `8876314f9a3fd837d8cb247508bd093656fc1722`.

Draft Extrude accepts both angle signs for one original major circular arc and its straight cardinal chord. The original cap chart covers the full circle width. The upper cap chart follows the actual upper arc, including a transition below 180°. The existing exact cone and plane producer retains the authored chord, arc and face names.

## Verification

- **PASS, baseline reproduction.** Desktop Chrome WebGPU refuses +10° for an editable radius-10 sketch with chord Y = −6 mm and endpoints X = ±8 mm. Apply stays unavailable and the sketch stays intact.
- **PASS, actual desktop candidate.** The 10 mm extrusion previews +10°. Cancel preserves the document and Undo availability. Preview and Apply succeed on the next attempt. History refuses +40° because the section closes before the top. Undo and Redo restore the +10° and −10° feature states. Native Save and fresh Open preserve the −10° result and its editable value. A −80° draft at 1,800 mm height refuses beyond the modeling coordinate range. Both desktop runs freeze 1,269 files with zero changed sources, page errors or console errors.
- **PASS, independent native checks.** With `d = z tan(θ)`, the cone radius is `10 − d`, the chord is at `Y = −6 + d` and both parabolic seams satisfy `X² = 64 − 8d`. Independent Simpson volumes at +10° and −10° are 2,196.171284193009 and 3,259.059602728270 mm³. Native and Worker volumes are within 2.49 × 10⁻⁸ mm³. The measured maximum edge-to-surface gap is 2.60 × 10⁻¹⁵ mm. Native controls verify centroid, chart membership, topology of one closed genus-zero solid, watertight tessellation, the +35° major-to-minor upper arc, all four shifted cardinal directions and reversed source tags. Five half-disk hashes and three minor-segment hashes match.
- **PASS, affected verification.** 58 Kernel, 94 Model and 88 Studio tests pass. Kernel emit, all three type checks, scoped ESLint, browser-driver syntax, diff check and Studio production build pass on Node 22.19.0.
- **NOT_RUN.** Noncardinal chords, arbitrary line–arc profiles, UV pcurve generation, full local suites, mobile and live providers. [#14](https://github.com/barocss/cad/issues/14) remains open for its wider acceptance. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for each desktop flow and the affected checks.
D1253_SOURCE_FROZEN=1 node apps/cad-studio/test/half-disk-draft-extrude-browser.mjs "$OUT/baseline" major --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
D1253_SOURCE_FROZEN=1 node apps/cad-studio/test/half-disk-draft-extrude-browser.mjs "$OUT/candidate" major
node --test --test-concurrency=1 packages/barocss-cad/test/{drafted-extrusion,drafted-half-disk-outward,drafted-circular-segment,drafted-major-circular-segment,drafted-cap-offset,box-wall-replacement,prismatic-cap-identity}.test.mjs
pnpm --dir packages/barocss-cad-model test extrude draft-command offset-drafted-wall toolset tool-contract
pnpm --dir apps/cad-studio test extrude-draft-failure draft toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
