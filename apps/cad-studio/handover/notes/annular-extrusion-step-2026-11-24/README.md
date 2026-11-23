# D1866 — Verify the linked annular extrusion in STEP

P2 [row 07](../../roadmap-rows/07.md), [row 13](../../roadmap-rows/13.md) and [row 16](../../roadmap-rows/16.md), [#222](https://github.com/barocss/cad/issues/222). Base `0f6f7ec98bf696f3f8e534c64fae213daa6e4ba3`. Small, evidence only. Reuse the D1861 circle-to-annulus driver and the existing independent Part 21 lexer and rational spline reader. The new oracle reads actual Studio export bytes using Python's standard library.

- **PASS, actual desktop Studio (10 states).** Create the R3 post by picking the original lower R12/R4 annular cap. Move the cap from Z20 to Z28 mm. The STEP panel reports two root bodies and discloses the loss of native feature history. Both exports use the current geometry. Fresh native Open retains the original association and a further History edit returns the post to Z20. Fresh STEP Open of each file reports two solids in millimetres and yields one import feature with two geometric outputs.
- **PASS, independent Part 21.** Read the attached millimetre context, both separate closed solids, cap planes, aligned axial seams, rational half-circle trims, complementary rims, oriented supports and closed incidence. The tube covers Z20–26 and Z28–34 mm and gives 2412.743157957 mm³ from both sets of measured dimensions. The post covers Z0–20 and Z0–28 and gives 565.486677646 and 791.681348705 mm³. The stock bore remains R4. Studio import volumes agree within 0.00001 mm³. The independent geometry comparison uses 0.0000001 mm.
- **PASS, negative controls.** Wrong active unit, wrong terminal station, an inner loop declared as an outer loop, and a displaced LINE seam are refused. Independent audit caught the latter false positive in the first oracle. The final checker verifies the direction and the two native endpoints against every actual LINE support. All checks use the same two actual Studio exports.
- **FAIL, first desktop driver.** The moved export and native reopen passed before an undeclared driver variable stopped the flow. The corrected driver captures and reads both actual export states.
- **NOT_RUN.** General STEP reader conformance, new third-party application imports, other target frames and placed targets, local production build and full local suites for this test-only change, and mobile. #222 remains open for its wider target and reference scope. The mechanical baseline stays at 8/10.

Run sequentially with the existing local Chrome and Playwright. The browser captures its local STEP output before the download anchor fires. No STEP or screenshot evidence belongs in Git.

```sh
node --check apps/cad-studio/test/annular-face-end-extrude-browser.mjs
D1866_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/desktop" --circle --step
python3 -I apps/cad-studio/test/annular-face-step-oracle.py "$OUT/desktop/annulus-and-post-20.step" 20
python3 -I apps/cad-studio/test/annular-face-step-oracle.py "$OUT/desktop/annulus-and-post-28.step" 28
```
