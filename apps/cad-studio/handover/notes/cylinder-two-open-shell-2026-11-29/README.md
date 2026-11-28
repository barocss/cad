# D2239 — Verify Shell on both end caps of a Cylinder

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `e9f392e27`.

The existing Shell accepts the original top and bottom caps of one upright radius-15 mm Cylinder. Its centre is (14, 9) mm and the cap stations are Z3 and Z23. The result is one closed genus-one solid. The two original cap names each own a planar annulus with two trim loops.

- **PASS, actual desktop.** Select both native end caps, Preview, refuse a 15 mm wall and Apply a 2 mm wall. Edit Wall to 4 mm in History, Undo, Redo, Save, Close, reload and Open. The radius-15 mm exterior and both annular rims remain. The respective volumes 3,518.583772 and 6,534.512719 mm³ agree with `20π(15² − (15 − wall)²)`. Both states have centroid (14, 9, 13) mm and strict native pcurves. The reopened 4 mm native result matches the edited result.
- **FAIL, first driver.** The refusal locator looked for the hidden kernel detail. The corrected check uses the visible wall-thickness refusal and verifies that Apply is unavailable.
- **NOT_RUN.** Other source and opening families, external readers, mobile and whole suites. This is verification of existing product behavior. #13 retains its broader Shell requirements. First mechanical CAD remains 8/10.

```sh
bash "$OUT/desktop.sh" studio-fixed
git diff --check
```
