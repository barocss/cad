# D2195 — Propose the first Cylinder from a browser

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `f12a518213a2d76dd9c669be0d5cf5da12a14c46` · [D2192 height revision](../webmcp-cylinder-height-proposal-2026-11-28/README.md).

Share the exact empty part, then grant one call for Box or Cylinder. A new grant retires the previous handle. `cad_part_propose_cylinder` requires the current revision, a finite radius of at least 0.5 mm and a finite height of at least 1 mm. The existing Cylinder command builds the result at the origin along +Z. The browser stages the preview. Studio approval adds the replayable command and native body to the part.

## Verification

- **PASS, actual desktop Studio.** Chrome 158.0.8127.89 verified read-only sharing, Box grant replacement, refusal of an old handle, stale revision and radius 0.49, one-call consumption and explicit approval. The R5 × 10 mm Cylinder had one native body, three faces, two edges and 785.398 mm³ in the browser summary. Undo restored the empty part and Redo restored the same command and body.
- **PASS, actual edit and reopen.** A fresh Extrude grant proposed a height of 15 mm and left the document unchanged until approval. The resulting body was 1178.097 mm³ with bounds from `[-5,-5,0]` to `[5,5,15]` mm. The original command and body identity survived the revision. Undo, Redo, browser-project Save, Close, reload and fresh Open preserved the expected document and decisions. The Box and rectangular Extrude desktop paths also passed. There were zero page errors, console errors, downloads or frozen-source changes.
- **PASS, local gates.** 25 Model tests, 18 Studio tests, Model and Studio type checks, scoped lint, production Studio build and whitespace check.
- **FAIL, initial test assertions.** The Model check used exact mesh extrema where roundoff required 1e-10 mm tolerance. The first full Cylinder driver compared the accepted part against a fixture without its proposal history. The final driver checks the exact accepted document. Both corrected checks passed.
- **NOT_RUN.** Full local suites, external browser clients, paid live runs, mobile and other primitives. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test browser-extrude-proposal proposals revision-pinned-edit tool-contract-mcp
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-final-cylinder" --first-cylinder
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-box" --box
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-rectangle"
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```
