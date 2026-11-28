# D2164 — Identify the rejected helical gear Intersect

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `42e86c46f643b59c1cc498e511bfae50085d06b9`.

The original native corpus pair has two 18-tooth, module 2, opposite-hand helical gears with 20° helix, 6 mm face width, 0.05 mm thinning and 3° phase. Both inputs pass native validity and each has approximately 6,729.533143 mm³. The native Intersect still refuses the two selection orders. One result contains an edge with one incident face and the reverse order contains an edge with three. The transverse profile estimate in the corpus remains an unqualified geometry oracle for this operation.

Studio previously reported that the gears could not be joined. The failed feature ID now selects an Intersect-specific message for this typed nonmanifold edge-use refusal. Studio retains the native detail and the last accepted document. The underlying Boolean remains unqualified and #7 remains open.

## Verification

- **FAIL, original geometry.** Both native runs returned `GEOMETRY` with invalid edge incidence. The observed incidence counts were one and three. No intersection volume was accepted.
- **PASS, desktop feedback and persistence.** Chrome reproduced the old join message. The final driver exercised both selection orders through Studio and confirmed the Intersect title, native Details, unchanged original body keys, volume and Undo/Redo availability. Save and fresh Open retained both original bodies. The run reported zero page errors, console errors and source writes across 705 frozen files.
- **PASS, affected checks.** 33 Model and 16 Studio tests, both package type checks, scoped ESLint, driver syntax and production Vite build.
- **NOT_RUN.** General helical surface intersection repair, independent qualification of a native intersection solid, full local suites and mobile. The first mechanical CAD baseline remains 8/10. Overall CAD completion remains unmeasured.

```sh
HELICAL_PAIR_FROZEN=1 node apps/cad-studio/test/helical-intersection-refusal-browser.mjs "$OUT/framed"
pnpm --dir packages/barocss-cad-model test measure hole-miss-location sew-gap-location r7-findings
pnpm --dir apps/cad-studio test failed-feature opening-shell-failure
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
