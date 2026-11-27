# D2075 — Read pinned native Guided Fill evidence

P1 [row 04](../../roadmap-rows/04.md), [row 08](../../roadmap-rows/08.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `58948fe572481919b16674c3eb25dcf566267f2b`.

`query.inspect` accepts `guidedFill` with exact `seam`, `first`, `second`, `guide`, and `donor` IDs plus `expectedDirectRevision`. Inspect a pending result with the proposal ID and `expectedProposalRevision`. The pending case replays one Guided Fill and checks the same source roles as the proposal. Inspect a current saved result with its visible `guidedFill.surface` ID from `query.render`.

The readback reconstructs the native support from the current inputs and compares the exact stored source and triangular trim. It reports the positional gaps at 33 samples per curve, the complete seam tangent-plane angle bound from the stored normal coefficients, and the strict native open-sheet topology. The saved read certifies the match to the supplied current geometry IDs. It does not infer historical ownership for an independently stored Direct surface.

## Verification

- **PASS, local MCP and desktop Studio WebGPU.** Stage and render the Guided Fill. The native response and the pending image identify the same output ID and same revision. The native response agrees with its MCP structured content. Hiding the guide removes the live preview and refuses old source and proposal pins. Undo restores the pending result. Studio Accept, Undo, Redo, Save and fresh Open preserve the exact evidence and image.
- **PASS, native readback.** The fixture reports a 0 mm maximum boundary gap, 0 mm maximum guide gap, and 0° total seam normal angle bound. Its independent native sheet has one face, three edges and three open edge uses, with `closed = false`. A different source ID, a different output ID and an edited support file with a current revision all refuse. The pending and approved reads have identical evidence and the corresponding files stay unchanged.
- **PASS, feature validation.** Tool contract, Guided Junction and Direct Ruled proposal tests pass 23/23. Scoped ESLint, browser-driver syntax, diff check, Studio and Model type checks and the Studio production build pass. The desktop run retains 1,115 frozen source hashes through cleanup with zero page and console errors.
- **FAIL, previous command baseline.** The untrimmed surface point reader refused the trimmed Guided Fill, and the pinned solid reader requested a face. The first exploratory script also assumed the trimmed output would appear in `query.summary`. The final baseline and feature proof obtain its actual ID from `query.render`.
- **NOT_RUN.** Paid live agents, arbitrary trimmed-surface inspection, persistent sewing, full local suites, and mobile. The Guided Fill record covers one local Agent workflow under #324. First mechanical CAD remains 8/10. Product-wide completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for the desktop run and build.
pnpm --dir packages/barocss-cad-model test toolset guided-junction agent-direct-ruled-proposal
tsc --noEmit -p apps/cad-studio
tsc --noEmit -p packages/barocss-cad-model
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
GUIDED_FILL_AGENT_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/guided-fill-agent-browser.mjs "$OUT/final"
```
