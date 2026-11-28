# D2152 — Refine the circular rim of an exact drafted sector

P4 [row 20](../../roadmap-rows/20.md) and [row 24](../../roadmap-rows/24.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `3c9d2d66efa575eef6c7699e368be5ff5048e75b`.

The exact circle of the original upright radial Draft could look faceted in Studio. The worker now offers a finer display mesh for a single accepted sector Extrude. The existing viewport selects detail using CSS pixel scale. Cap triangles and the picked rim share the same sampled vertices and canonical owner indices. The model document, native B-rep, volume, display budget and GPU backend code stay unchanged.

## Verification

- **PASS, desktop WebGPU and WebGL2.** The −30° draft of a 306.869898° sector retains edge `{body: 0, edge: 3}` at both zooms. At a 132.19 CSS px radius, measured deviation from the independent projected circle changes from 0.63654 to 0.06031 CSS px. At 473.08 CSS px it changes from 2.27799 to 0.21582 CSS px. The displayed upper rim uses 102 chords instead of 32. Pixel samples also verify the shaded side of the native circular boundary. All three final browser runs have zero page errors or frozen-file changes. In WebGPU, native Save and a fresh Open preserve the editable Extrude and regenerate the same display detail. The ordinary cylinder control retains both tiers and the original picked rim.
- **PASS, unchanged geometry and ownership.** The sector keeps its original radial planes. The independent solid volume is 5,087.767988706922 mm³ and the Studio worker agrees within 1e−7 mm³. The canonical mesh buffers and owners match directly with optional detail disabled. Both circular trims share samples with their two rendered owners. The fine packet is 183,608 bytes, within the existing 192 KiB budget. The native upper rim identities are `n1.side1#1|n1.top` and `n1.side1#2|n1.top`.
- **Corrected failures.** The first two-tier candidate could fit only quality 16 and measured 0.56956 CSS px at high zoom. Quality 26 fits as one packet and passes the 0.25 CSS px target at the two measured scales. The initial focused test passed at runtime but failed TypeScript inference for its owner lookup. An explicit edge type resolved the error.
- **PASS, affected checks.** 10 Model and 112 Studio tests, Model and Studio TypeScript, scoped ESLint, browser driver syntax, diff check and Studio production build on Node 22.19.0.
- **NOT_RUN.** Live command ghost, tilted source planes, other curved feature families, mobile and full local suites. The #608 HOLD stays in effect. #14 remains open. The first mechanical CAD baseline is 8/10 accepted. Overall completion is unmeasured.

```sh
D1145_SOURCE_FROZEN=1 node apps/cad-studio/test/native-cylinder-zoom-browser.mjs "$OUT/baseline" --draft-sector --baseline
D1145_SOURCE_FROZEN=1 node apps/cad-studio/test/native-cylinder-zoom-browser.mjs "$OUT/final" --draft-sector
D1145_SOURCE_FROZEN=1 node apps/cad-studio/test/native-cylinder-zoom-browser.mjs "$OUT/webgl2" --draft-sector --webgl2
D1145_SOURCE_FROZEN=1 node apps/cad-studio/test/native-cylinder-zoom-browser.mjs "$OUT/cylinder-control"
node packages/barocss-cad-model/scripts/test.mjs cylinder-display arc-sweep-display display-edge mesh-wire extrude-draft-binding
node apps/cad-studio/scripts/test.mjs viewport display-mode draft
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
