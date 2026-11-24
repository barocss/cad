# D1930 — Qualify circular instance orientation in Studio Drawing and STEP output

P3 [row 10](../../roadmap-rows/10.md), [#263](https://github.com/barocss/cad/issues/263). Base `1bb704c5dd6aa56cc3dda735c38d2e9129e6b1fc`. Output qualification of the bounded top-level profile.

- **PASS, Studio.** Opened the actual D1928 Keep save. Exported the 1:2 Assembly SVG and STEP for Keep, then changed orientation in the actual instance inspector and exported both files again. The same orbit origins and one Skip remained. Four actual Studio scenes cover both drawings and both STEP previews.
- **PASS, independent output readings.** The Python reader follows each STEP solid's shell topology to eight unique native vertices. Both exports have one base and three brackets. The SVG reader checks all 16 Top-view segments and exact coordinate parity with the rendered sheet. Keep gives three 4 × 10 mm footprints. Rotate gives one 4 × 10 mm and two 10 × 4 mm footprints at the same occurrence origins. Substituting the opposite-mode STEP or SVG fails its respective oracle.
- **PASS, retained metadata.** The 42 focused Model tests include explicit retention of names, whole-occurrence visibility, body material and color, shared revision and Skip through a mode-only edit. Model types, scoped ESLint and diff check pass.
- **FAIL, earlier harness attempts.** The first locator required a horizontal SVG line to report visible. It was present with zero height. The second attempt captured HTML serialization without the SVG namespace. The final run selects the attached line and uses XML serialization.
- **NOT_RUN.** Nested patterns, path or sketch or body patterns, Motion, PDF and other exchange formats. These remain outside the declared ordinary top-level circular scope. D1928–D1930 complete the declared #263 criteria subject to exact main CI and the issue evidence comment. First mechanical CAD is 8/10 accepted. Whole-product completion is unmeasured.

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| Keep SVG | 9472 | `e1c62625f655837480d7fde19955bf315d519695416a8f8dbd6cb34907418e97` |
| Keep STEP | 18368 | `e6e41bb01abc889a143103cb64c6781050d84aa9e28087d6f7aebfc8cd3a1dc5` |
| Rotate SVG | 9321 | `137e8627eafb7c436995b9d73a714f6ae38d62e286fa830ac9ef5444a61eadb2` |
| Rotate STEP | 18389 | `ec43a33bd08761184cf1a0852378c5fa90b8fabbdc1861044714ef9d72ce413c` |

```sh
PATTERN_OUTPUT_FROZEN=1 node apps/cad-studio/test/instance-pattern-orientation-output-browser.mjs "$OUT/studio" "$PRIOR_STUDIO_KEEP_FILE"
node packages/barocss-cad-model/scripts/test.mjs instance-pattern
pnpm --filter @barocss/cad-model type-check
git diff --check
```
