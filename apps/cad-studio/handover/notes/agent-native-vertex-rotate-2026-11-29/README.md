# D2247 — Propose Rotate about one native vertex

P5 [row 04](../../roadmap-rows/04.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `6b22a5461`.

Use the `from` or `to` endpoint of one complete native straight edge named by `query.summary`. The current revision, axis and finite signed angle are explicit. The Model uses the original endpoint coordinates and the existing editable Rotate feature. Ordinary Rotate and Rotate about a cardinal edge use their existing admission.

- **FAIL, base reproduction.** The current edge name, upper endpoint and world X axis produced `COMMAND_INPUT` before evaluation.
- **PASS, local Agent and actual desktop Studio.** A +30° X proposal uses the upper endpoint of `n1.side0|n1.side1` at (44.125, −3.75, 18.375) mm. Missing or stale revisions, duplicate edge names, an invalid endpoint and coordinate overrides refuse. Preview and Hide preserve the part. Explicit approval commits one Rotate node. Undo/Redo and Project Save, Close, reload and Open preserve the approved geometry and history.
- **PASS, independent native oracle.** The selected endpoint remains fixed and the opposite endpoint moves. The eight coordinates match the rigid transform within 1e-7 mm. The native solid is closed and passes strict checks. Its volume is 9,600 mm³ and its centroid is (24.125, 7.9102540378443855, 18.178847577293368) mm. All 1,304 frozen sources match after the desktop run. The later type-only edit emits identical JavaScript.
- **PASS, affected checks.** 36 Model and 24 Studio tests, including both endpoint choices, ordinary and edge rotation, tool contracts and proposal checks. Model and Studio type checks, affected lint and production build pass on Node 22.19.0.
- **FAIL, initial checks.** The first test matched JSON inside an encoded string. The first type check found an inferred return union wider than the endpoint contract. Both checks pass after correction.
- **NOT_RUN.** Live natural-language providers, arbitrary vertex deformation and full local suites. The first mechanical CAD baseline remains 8/10. The broader #629 remains open.

```sh
node packages/barocss-cad-model/scripts/test.mjs edge-rotate-agent toolset tool-contract proposals.test
node apps/cad-studio/scripts/test.mjs vertex-pick-filter rotate-outline edge-rotation toolset-mcp tool-contract-mcp
bash "$OUT/desktop.sh" desktop-01
git diff --check
```
