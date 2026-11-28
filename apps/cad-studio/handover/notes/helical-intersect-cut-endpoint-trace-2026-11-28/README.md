# D2174 — Trace the original helical Intersect to two flank trims

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `d3ad7d6c71bb5bb23a10bd3a2335da66131cabef`.

The uninstrumented fixture and temporary observation build return identical errors and identical existing Boolean trace payloads in both input orders. The inputs are strict valid solids of approximately 6,729.533143 mm³ each.

The orders produce the same 13 source-qualified faces with deduplicated cuts and the same 236 region classifications (219 outside, 9 inside, 8 same). Five physical stations per cut agree within 1e−8 mm after matching by source face and direction. Each order keeps 13 pieces. On `a_of3` and `a_of105`, a cut traverses and retraces part of the same kept face boundary before stitching. The cut endpoints sit 0.00028357 and 0.00003357 apart from the matching trim in the scaled surface chart. The corresponding world gaps are 9.58e−7 and 4.10e−7 mm, within the existing Boolean tolerance of 1e−6 mm. These chart closures fail before edge stitching.

| Operand order | Baseline faults | Faults after the temporary endpoint experiment |
| --- | ---: | ---: |
| A → B | 10 single uses, 17 triple uses | 13 single uses |
| B → A | 10 single uses, 16 triple uses | 13 single uses |

In the experiment, two temporary chart links reach verified trim points within the existing world tolerance. This removes all observed triple uses, and both orders still refuse. Remaining single uses include disconnected flank and neighboring root boundaries and flat caps. This result supports an endpoint-closure cause for the retraced segments. A product repair also needs complete shared intersection endpoints and consistently closed cap boundaries. The tolerance policy and acceptance checks remain authoritative.

## Verification

- **PASS.** The baseline and observer bundles retained identical input validity, classification trace and refusal outputs in both orders. The temporary endpoint experiment reproduced the fault-count change above.
- **PASS, actual desktop Studio.** Chrome opened the original corpus pair, selected both input orders and reported the operation-specific Intersect refusal with native details. Each refusal retained both 6,729.533143 mm³ originals and the Undo/Redo availability. Browser-project Save, Close, reload and Open retained the exact document. The flow recorded 708 unchanged source files and zero page errors, console errors and downloads.
- **FAIL.** Baseline and temporary endpoint experiment still return no native intersection solid. #7 remains open.
- **NOT_RUN.** A conforming native intersection or independent global volume error bound, geometry changes, full local suites and mobile. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language agent completion remain unmeasured.

The local esbuild observation build instrumented `analyticBoolean` after cut deduplication and before stitch, then `stitchWith` after the edge use map was populated. The input was `gear-helical-pair-crossing-intersect.json` with the last feature's target and tool exchanged in the second order. The observation and trial bundles lived outside the worktree.

```sh
node "$OUT/build-trace.mjs" "$OUT"
node "$OUT/stock.mjs"
node "$OUT/observed.mjs"
HELICAL_ENDPOINT_PROBE=1 node "$OUT/observed.mjs"
HELICAL_PAIR_FROZEN=1 node apps/cad-studio/test/helical-intersection-refusal-browser.mjs "$OUT/studio"
```
