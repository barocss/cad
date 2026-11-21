# D1575 — Qualify both polygon Screw windings through Studio AP214

P2, row 13, [#630](https://github.com/barocss/cad/issues/630). Base `b5e64aa54df77ece3dad16512a51646fac4815ec`.

Export the D1574 approved pentagon and hexagon Screws through the Studio STEP panel. Measure −450° from the approved projects. Create +450° by editing the signed History angle at the same 40 mm pitch and 50 mm advance. Feed the exact exported bytes to the independent Part 21 reader and to fresh Studio sessions.

- **PASS, actual desktop Studio export.** All four runs show AP214 B-rep in millimetres and disclose feature history, semantic PMI and named datum transfer limits. Export keeps the working projects exact. Each positive History edit keeps the original terminal Loft node.
- **PASS, independent file read.** Resolve every Part 21 reference and verify millimetre units, the closed shell, consistent edge uses and side support poles. Each rail has 16 cubic poles and the recovered signed rotation is within `1e-8°` of the requested ±450°. The largest deviation at any of the 16 stations is `2.419e-14 mm`. The shape volumes come from independent Gauss integration of the serialized cross-section area.
- **PASS, fresh desktop Studio Open.** The exact bytes open as one import with strict valid native topology. The reopened names of the native faces match after the import prefix. All 121 evaluated positions per reopened rail match the source positions exactly after ordering along the axis. Maximum measured round-trip rail deviation is `0 mm`. Volume matches the independent integral within `5e-12 mm³` in these samples. The imported projects carry the expected exchange loss of the original feature history and proposals. All four runs have zero runtime errors, console errors and frozen source changes.
- **FAIL, viewport quality after import.** The native projects use 2,140 pentagon or 2,568 hexagon display triangles in the structured packet. All four reopened views lose that detail and exhibit visible faceting. The coarse packets upload 392 pentagon or 484 hexagon vertices. D1576 addresses recognition and verifies fixed-camera rail accuracy and picking.

| Profile | Faces / edges / vertices | Independent volume (mm³), either sign |
| --- | --- | ---: |
| Pentagon | 7 / 15 / 10 | 1350.078786522149 |
| Hexagon | 8 / 18 / 12 | 2300.134228889587 |

| Export | Exact file SHA-256 |
| --- | --- |
| Pentagon −450° | `2a5f3ec0a707f5ce4d63dac352fdaa66eb05fc2ee7f358b03ecbddabdc58e676` |
| Pentagon +450° | `8dd4c5ddd6c45127b91b4af4d0e81497c53c67f9f55f108b664d2bb36e6edd19` |
| Hexagon −450° | `f8099266a71a7c4f533dd11178e4df9ea191e5234c3eeda4a7fb97a51cc1d7d2` |
| Hexagon +450° | `5477077af0355d6165c94938b2eb7fe9f4de58bbfb87ff982fafa41f87ff1f29` |

- **PASS, affected checks.** 30 Model and 14 Studio tests, an independent recheck of the D1569 negative triangle STEP, scoped ESLint, browser syntax and Git diff.
- **NOT_RUN.** Third-party CAD interoperability, quantitative viewport quality in this item, mobile and full local suites. #630 remains open.

Use Node 22.19.0, installed desktop Chrome and Playwright, and Python. Set `PROFILE` to `pentagon` or `hexagon`, `WINDING` to `negative` or `positive`, and `PROJECT` to the corresponding D1574 approved file. Gate heavy runs and keep STEP files and captures outside Git.

```sh
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE" "$PROJECT" "--$PROFILE-screw-$WINDING"
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$EVIDENCE/approved-turn-from-studio.step" "--$PROFILE-screw-$WINDING"
pnpm --dir packages/barocss-cad-model test step-export-scope smooth-triangular-turn smooth-screw-command
pnpm --dir apps/cad-studio test step-export-preparation
pnpm exec eslint apps/cad-studio/test/smooth-turn-step-browser.mjs
node --check apps/cad-studio/test/smooth-turn-step-browser.mjs
git diff --check
```
