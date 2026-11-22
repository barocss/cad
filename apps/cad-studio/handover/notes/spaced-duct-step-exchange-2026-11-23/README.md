# D1742 — Qualify STEP geometry for the trimmed rectangular S-bend

P2 Exchange, rows 13 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `f329755ea1559a5fae33b52264f52e53020fdda7`. Source is the accepted X2 inlet trim from [D1739](../spaced-duct-inlet-boolean-2026-11-23/README.md).

Qualify one bounded AP214 geometry transfer. The native exporter used by the Studio worker writes a local sample. Studio prepares a preview on the original authored document, then fresh-opens the generated sample. Add the desktop qualification driver.

- **PASS, desktop Chrome / WebGPU.** Studio prepares a millimetre STEP with one root body. The preview lists feature history and parameter losses, and explains the limit on continuity inspection. The source stays intact. Fresh Open creates one imported solid with no native parameters. Actual left and right viewport rays enter the openings. Adjacent rays land on the X2 and X30 mm planes.
- **PASS, independent geometry and raw Part 21 inspection.** Physical section integration gives 849.8261137902479 mm³. Raw validation metadata reads 849.8261137902487 mm³. The independent record audit finds 18 advanced faces, 20 loops, 48 edges, 32 vertices and two opposite uses for each edge. It identifies 10 planar and eight rational surfaces and two caps with one outer and one inner four-edge loop each. The separate raw audit confirms opposite winding at the eight rational bend-wall supports and a maximum radius error of 7.11e-15 mm.
- **PASS, product self-read.** It returns a strict genus-one solid with the same native counts. The imported branch and the desktop model both measure 849.8261137902463 mm³. The eight source joints have valid native pcurves. After STEP Open those eight results report `missing-pcurve`, as disclosed in the preview. The emitted STEP SHA-256 was `09b8602f748cb054353bf8fbbe8d4f904117dcc23b2d2f00e7fbb1205c5fded6`.
- **PASS, affected checks.** 16 Studio tests for STEP preparation and metadata, scoped ESLint, driver syntax and Git diff check. The desktop receipt records zero downloads, frozen-source changes, page errors and console errors.
- **FAIL.** No product failure reproduced in this bounded case. An initial scratch probe failed to start because of a syntax error. The final desktop and native writer paths completed.
- **NOT_RUN.** The Studio download action, third-party geometry readers, AP242, exchange of editable history or pcurves, other Sweep families, full local suites, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #10 stays open.

The source volume is `16(15π + 8) − 6[I(14) − I(10)] + 4[I(13) − I(11)]` mm³, where `I(r) = [r² asin(2/r) + 2√(r² − 4)]/2`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories.

```sh
D1739_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-duct-inlet-trim-browser.mjs "$SOURCE" --spaced-opposite
D1742_SOURCE_FROZEN=1 node apps/cad-studio/test/spaced-duct-step-exchange-browser.mjs "$OUT" "$SOURCE/trim-reopened-doc.bcad"
rg -c 'ADVANCED_FACE\(' "$OUT/trimmed-spaced-duct.step"
rg 'SI_UNIT\(\.MILLI\.,\.METRE\.\)' "$OUT/trimmed-spaced-duct.step"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test step-export-preparation step-metadata
pnpm exec eslint apps/cad-studio/test/spaced-duct-step-exchange-browser.mjs
node --check apps/cad-studio/test/spaced-duct-step-exchange-browser.mjs
git diff --check
```
