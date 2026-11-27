# D2120 — Verify Union at one exact sphere-box vertex contact

P5 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `28fd98d15dfd96070f2ee499148dbd659f9bf87b`.

The box spans [0,20] mm on each axis. The radius-3 mm sphere is centred at (21,22,22) mm. Its unique nearest point on the box is (20,20,20), at squared distance `1 + 4 + 4 = 9` mm². The independent material reference is therefore `8000 + 36π` mm³, with the centroid weighted from (10,10,10) and (21,22,22). The existing Boolean passes this exact case. This delivery adds a reproducible desktop qualification.

- **PASS, actual desktop.** Select the two original bodies and run Union in both orders. Studio presents the result as one output with two separate strict native solid bodies, two closed shells and eight faces. Undo returns the two original items. Redo, native Save and fresh Open reproduce the exact forward B-rep digest `856472718184e1f05d015412b86a72769163f3ab34f3a35d72950266fc532059`. The source freeze retains 1,272 files with zero source changes, runtime errors or console errors.
- **PASS, independent mass and topology.** The expected volume is 8,113.097335529233 mm³ and the expected centroid is (10.153341028631996, 10.167281122143995, 10.167281122143995) mm. Native and Worker volume and native centroid pass in both orders. The largest native volume discrepancy is below 2 × 10⁻¹¹ mm³. The two orders retain their own native entity ordering. Separate native diagnostic runs move the sphere centre by 0.03 mm along the line through the contact point. The gap yields two strict solids, and penetration yields one strict connected solid.
- **PASS, small checks.** Browser driver syntax and diff check pass on Node 22.19.0. No product code changes.
- **FAIL, corrected probe.** The first raw kernel probe omitted the required empty parameters record and admitted no sample. The corrected probe checks both source solids before Union.
- **NOT_RUN.** Desktop gap and penetration controls, original graze and helical-gear TODOs, broader contact and commutativity, full local suites, mobile and live providers. [#7](https://github.com/barocss/cad/issues/7) remains open. First mechanical CAD stays at 8/10. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while Chrome runs.
node --check apps/cad-studio/test/sphere-box-point-union-browser.mjs
SPHERE_BOX_POINT_UNION_FROZEN=1 node apps/cad-studio/test/sphere-box-point-union-browser.mjs "$OUT/studio"
git diff --check
```
