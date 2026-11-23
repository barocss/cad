# D1860 — Verify the original six-face cylinder gallery

P5 [row 08](../../roadmap-rows/08.md) and [row 30](../../roadmap-rows/30.md), [#368](https://github.com/barocss/cad/issues/368). Base `390dcde8ef164244ab83c6f409375f114bb02c0f`.

The gallery calls for an open cylinder sector, an inward normal offset and six exact closing faces. D1632–D1635 implement the supported recipes. This change records the original quarter-cylinder fixture at radius 20 mm and axial height 30 mm. Product code did not change.

- **PASS, actual desktop Studio.** Draw the 90° Centre arc in a new part. Use Make curves, Duplicate, Move 30 mm in Z and Ruled surface to make the open patch. An inward offset of 20 mm is refused. The 2 mm preview retains the source. Apply makes the six-face solid. Edit inward thickness to 3 mm, save and reopen in a fresh context. The original Direct source and all six native face names remain.
- **PASS, independent geometry.** At 2 mm, one strict solid has six faces, twelve edges and eight vertices. The skins have radii 20 and 18 mm. The result has two radially oriented walls and two annular-sector caps at Z = 0 and 30 mm. Volume is 1790.707812546 mm³ (570π) and area is 2030.088333383 mm² (608π + 120). The 3 mm edit gives an inner radius of 17 mm, volume 2615.375884114 mm³ and area 2097.942315017 mm². Closed-form and native results agree within `1e-7`. Native Save and fresh Open retain digest `db5e9c32324b0d27552b418cbff916bc1a335c62900b28c5a096e76a10aaa23d`.
- **PASS, affected checks.** The original radius-10, height-12 authored control repeats the D1634 native digest. Both final desktop workflows record seven states with no source changes or runtime errors. Browser-driver syntax, scoped lint and Git diff checks pass.
- **FAIL, initial test driver.** The first run applied the part and reached native inspection. The verifier shadowed its source radius variable. The corrected verifier completed both runs.
- **NOT_RUN.** Full local suites, other renderers, general trimmed and tilted patches, and Boolean composition. The narrow [#368](https://github.com/barocss/cad/issues/368) scope is fulfilled. The wider [#11](https://github.com/barocss/cad/issues/11) remains open. First mechanical CAD remains 8/10 and overall completion remains unmeasured.

```sh
node --check apps/cad-studio/test/exact-cylinder-thicken-browser.mjs
pnpm exec eslint apps/cad-studio/test/exact-cylinder-thicken-browser.mjs
D1860_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-thicken-browser.mjs "$OUT/gallery-final" --gallery
D1634_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-thicken-browser.mjs "$OUT/quarter-control" --authored
git diff --check
```
