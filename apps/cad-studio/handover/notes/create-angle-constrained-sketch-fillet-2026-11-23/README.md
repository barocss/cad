# D1757 — Keep the authored corner angle when creating a Sketch Fillet

P1 daily Sketch editing, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `e0f0744f8910730770e99edc866a0a772070cf46`.

An angle between adjacent sketch sides is measured from their shared corner. Once a Fillet separates the two sides, the same physical corner uses the supplementary angle between their drawn directions. Convert the value while remapping the rule for these two sides. Keep other angle rules and existing Chamfer and line-to-arc operations on their established paths.

- **FAIL, original Studio geometry.** Apply R6 at (30, 0) mm on a 3:4:5 corner with an authored 143.13010235415598° angle. The original result stores that value between separated sides. It settles and saves the contacts at (52, 0) and (55.6, 10.8) mm. The downstream Extrude reports 23,369.656478063374 mm³.
- **PASS, desktop Studio WebGPU.** The corrected preview retains the source until Apply. The two contact points finish at (28, 0) and (31.6, 1.2) mm. The physical included corner stays 143.13010235415598° and the separated side rule stores 36.86989764584402°. The five original side IDs and carrier planes persist. The 10 mm Extrude agrees with the independent material area. Undo restores the sharp source and Redo restores R6. Save and fresh Open preserve R6. Edit the reopened Fillet to R9.
- **PASS, local Agent.** Discover the original side pair, refuse a stale revision, and explicitly approve the same R6 proposal in Studio. Feature nodes and native B-rep match the manual result.
- **PASS, affected checks.** 35 Model and 38 Studio tests. Model types, scoped ESLint, Studio types and production build, driver syntax and Git diff check pass. 92 other ordinary, right-angle, unrelated-angle, line-to-arc and Chamfer results match the original code byte for byte. The saved R6→R9→R15 Studio control matches the earlier D1756 native digests. Three passing runs record 19 desktop checkpoints with zero source, page or console errors.
- **FAIL, recovered harness.** The first candidate run verified creation and reopened native R6 before a local locator name shadowed the resize Apply helper. Rename the locator and rerun the whole desktop path and control.
- **NOT_RUN.** Full local suites, arbitrary angle-constraint layouts, angle-constrained oblique Chamfer, alternate GPU backends, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion is unmeasured. Issue #21 stays open.

| Verified result | Native Extrude volume | Native B-rep digest |
| --- | --- | --- |
| Created R6 | 20,995.830199582793 mm³ | `b90e7d6f714d074dba797971ab67f44f9454700f225af8655fde379559e95d5c` |
| Resized R9 | 20,990.617949061285 mm³ | `eae8911ee64dbd663011e6020d702fabab8177472775727f7630b2b1ada4fa03` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate browser driver.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-edit-identity sketchIds draft-history
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/{src/sketch/corner.ts,test/corner.test.ts} apps/cad-studio/test/sketch-oblique-fillet-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-oblique-fillet-browser.mjs
D1757_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-oblique-fillet-browser.mjs "$OUT/base" --create --expect-unavailable
D1757_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-oblique-fillet-browser.mjs "$OUT/create" --create
D1756_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-oblique-fillet-browser.mjs "$OUT/saved-control"
git diff --check
```
