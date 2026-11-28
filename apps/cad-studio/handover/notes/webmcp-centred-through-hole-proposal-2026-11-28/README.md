# D2196 — Propose a centred axial through Hole from a browser

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `fa73ed07f63cb0cbf9c5f32e7f1a670aaf3716bc`.

Grant one Hole proposal on a shared, standalone standard Cylinder. `cad_part_propose_hole` accepts a body key, a pinned revision and a diameter of at least 0.5 mm and smaller than the Cylinder outside diameter. The adapter finds the exact native upper cap and uses the sketch centre in world XY. It stages the existing through Hole command for Studio approval. A grant for Hole retires the Extrude grant.

## Verification

- **PASS, actual desktop Studio.** Chrome 158.0.8127.89 verified the replaced grant, wrong body, stale revision, unsupported diameter and one-call consumption. The R5 × 10 mm Cylinder started at [8, −3, 4] mm. The Ø4 mm preview showed a 125.66 mm³ reduction. Reject kept the original body at 785.398 mm³.
- **PASS, actual acceptance and reopen.** The next grant staged a new proposal. Studio approval produced one native body at 659.734 mm³. The outer bounds remained from [3, −8, 4] to [13, 2, 14] mm. The original Cylinder nodes remained intact. The Hole used `n1.top`, centre [8, −3] and radius 2 mm. Undo, Redo, browser-project Save, Close, reload and fresh Open restored the expected documents, decisions and native volume. The first Cylinder, first Box and rectangular Extrude desktop paths also passed. There were zero page errors, console errors, downloads or frozen-source changes.
- **PASS, local gates.** 26 Model tests, including the independent 210π mm³ result and strict native topology with one genus-1 shell, six faces and 12 edges. Model and Studio type checks, scoped lint, production build and whitespace check passed.
- **FAIL, initial assertions.** The Model test expected separate command metadata on the single Hole node. The saved proposal operation and native feature already carry the command and geometry. The first two desktop drivers assumed one decimal place for the volume change and that read sharing survived Reject. The corrected checks passed.
- **NOT_RUN.** Full local suites, bore families beyond this centred through cut, external clients, paid live qualification and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test browser-extrude-proposal proposals revision-pinned-edit tool-contract-mcp
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-hole" --hole
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-cylinder" --first-cylinder
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-rectangle"
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-box" --box
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```
