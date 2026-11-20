# D1420 — Offset a plate cap with one circular through hole

2026-11-21 · P5, row 31 · [#17](https://github.com/barocss/cad/issues/17) · Base `d25dff490154f91ca3d28e72ccbff5fdd8062dde`

Desktop Studio at the base commit refused a +2 mm move of the top cap of a 40 × 30 × 10 mm plate with one Ø6 through hole. The strict source solid was valid. The new native route admits a rectangular prism with two Z stations and one fully enclosed straight cylindrical bore. It checks both caps, all four planar walls, the two inward cylindrical patches, complete circular rims, and the parameter-space trims. It assigns the selected station directly, preserving XY, the fixed cap, the parameter-space trims and the topology IDs. Studio, History and the agent share the existing signed-distance `offset-face` recipe.

- **PASS, numeric geometry.** The independent area is `1200 - 9π` mm². For both caps, +2 mm produces 14060.707993412296 mm³ and −2 mm produces 9373.805328941538 mm³. The Studio and native volumes agree with the formula within `1e-7` mm³. The centroid, Z levels, and bore axis at (11, 9) with radius 3 mm agree with the independent values. Native IDs and all 36 coedge pcurves match the source. The strict result contains 8 faces, 10 loops, 18 edges, and 12 vertices. The largest reported edge-to-surface gap in the desktop receipts is `1.78e-15` mm.
- **PASS, desktop Studio.** Chrome at 1440 px (top) and 1024 px (bottom) selected the original cap, launched the command and dragged its normal handle from +2 to +3 mm. The visible drag scales were 11.94 and 8.89 CSS px/mm. Apply at +2 mm, a refused −10 mm collapse, History edit to −2 mm, Undo, Redo, native Save and fresh Open all passed on both caps. The legacy drafted-cap and axis-wall reference-plane flows passed. All four final receipts recorded zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 31 Kernel, 53 Model and 8 Studio tests, scoped lint, browser test syntax, Kernel build, Model type-check and Studio production build including type-check. The Model tests cover the shared agent command, reopening, repeated signed offsets and the distance-only admission in History and raw documents. Kernel controls include the large centered bore, fractional translated stock, collapse and reversal, blind and countersunk holes, a notch, and an altered pcurve.
- **FAIL, intermediate.** The first Model type-check found two test typing errors, corrected before the final runs. The first bottom-cap browser run measured 0.0022 CSS px/mm while an older ViewCube turn could override the new command view. Explicit viewport view changes now retire the older turn. Both final flows passed the physical drag.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export, and the wider #17 delete and replace acceptance. This is the single-bore offset case.

Use Node 22.19.0, a configured desktop Chrome and Playwright, and a separate output directory. Run heavy tasks one at a time.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{bored-cap-offset,drafted-cap-offset,prism-wall-offset}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-face offset-to-plane offset-hexagonal-wall offset-plane-retention native-offset-face offset-drafted-wall
node apps/cad-studio/scripts/test.mjs offset-face-launch-view offset-hex-side-feedback
pnpm --filter @barocss/cad-model type-check
cd apps/cad-studio
pnpm build
BORE_CAP_OFFSET_FROZEN=1 node test/offset-bored-cap-browser.mjs "$OUTPUT/upper"
BORE_CAP_OFFSET_FROZEN=1 node test/offset-bored-cap-browser.mjs "$OUTPUT/lower" --lower
D1254_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$OUTPUT/legacy"
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$OUTPUT/reference" axis
```
