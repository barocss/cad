# D2248 — Propose Move from one native vertex to another

P5 [row 04](../../roadmap-rows/04.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `5fa5b7c57`.

Use two native edge names unique within the current part from `query.summary` in source, destination order. Select `from` or `to` on each edge and supply the current revision. The Model uses those original vertices and its existing editable Move command.

- **FAIL, base reproduction.** The existing Agent Move refused this explicit pair before evaluation.
- **PASS, local Agent and actual desktop Studio.** The proposal moves the source from (14.25, −4.5, 8.125) to (32.75, −9.25, 11.625) mm. The command derives displacement (18.5, −4.75, 3.5) mm. Missing or stale revisions, same-body choices, invalid endpoints and coordinate overrides refuse. Preview and Hide preserve the part. Explicit approval adds a single translation. Undo/Redo and browser Project Save, Close, reload and Open retain the source and destination roles.
- **PASS, independent native geometry.** The eight translated vertices and centroid (26.75, −5.25, 8.625) mm match the displacement within 1e-9 mm. The source is a strict closed solid at 576 mm³. The destination's 15,845 serialized B-rep bytes match exactly. Reversed roles move the other solid with the opposite displacement in the focused Model test. Coincident endpoints refuse with no history entry. The desktop run retains all 1,304 frozen source hashes and records zero console errors.
- **PASS, affected checks.** 39 Model and 16 Studio tests, Model and Studio type checks, affected lint and production build on Node 22.19.0.
- **NOT_RUN.** Live natural-language providers, assembly instances, linked point constraints and full local suites. The first mechanical CAD baseline remains 8/10. The broader #629 remains open.

```sh
node packages/barocss-cad-model/scripts/test.mjs vertex-move-agent edge-rotate-agent toolset tool-contract proposals.test
node apps/cad-studio/scripts/test.mjs vertex-pick-filter edge-rotation toolset-mcp tool-contract-mcp
bash "$OUT/desktop.sh" desktop-01
git diff --check
```
