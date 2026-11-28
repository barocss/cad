# D2271 — Propose the original Box depth from a second native corner

P5 [row 04](../../roadmap-rows/04.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `44e039ad8`.

- **FAIL, base capability.** A real local stdio proposal with the two original edge endpoints and `boxVertexAxis: "y"` refused before editing the Box.
- **Decision.** Reuse the native Box endpoint resolver, exact current revision guard and ordinary Box edit. Use the explicit depth axis only with two independent original Boxes. The original +Y edge endpoint owns the source. The second Box's endpoint supplies the one-time target. Keep the existing two width modes. Enforce user approval for either footprint axis, including high autonomy and partial proposal handling.
- **PASS, local MCP and Studio.** The local Agent uses native source `n1.side2|n1.side3` (to) and target `n3.side0|n3.top` (from). The approved source face moves from Y=3.5 to Y=9 mm, retaining Y=−4.5. Studio applies the exact depth of 13.5 mm and 972 mm³. The independent reference B-rep is byte-identical. Direct edit, stale revision, wrong side, wrong owner, mixed scalar input and automatic L4 acceptance refuse. Preview, Hide, explicit user Accept, Undo/Redo and fresh project Open pass. The actual final run froze 1,644 source files and reported no console errors.
- **PASS, automated.** Node 22.19.0 passed 54 Model and 28 Studio cases. Model and Studio types, affected lint and the production Studio build passed.
- **NOT_RUN.** Browser WebMCP admission for depth, remote providers, placed parts, persistent matching, mobile and the full local kernel suite.

```sh
node "$OUT/baseline.mjs"
bash "$OUT/desktop.sh" first
bash "$OUT/validate.sh"
git diff --check
```
