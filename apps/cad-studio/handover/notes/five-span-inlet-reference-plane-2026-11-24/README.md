# D1858 — Link the original five-span inlet to a native plane

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#17](https://github.com/barocss/cad/issues/17). Base `74b374b3da9e9ad01d371603d65bb525cfe5198b`.

Offset face now offers To plane at the original inlet of the exact line–arc–line–arc–line paired Sweep. It stores the picked native cap, the separate reference face and its existing witness. When the reference moves, evaluation resolves the signed displacement with the existing exact inlet operation. History can select another parallel face. Distance-only limits on shorter sweeps and the pinned Agent scope for the outlet remain in effect. The Kernel and file schema did not change.

- **PASS, actual desktop Studio.** The original inlet at X = −10 mm followed the picked face to X = −14 mm. Moving the same reference moved the inlet to X = −6 mm. History chose its other native face at X = −11 mm. Undo, Redo, Save and fresh Open retained the binding. A nonparallel face and an inlet that reaches its first join were refused. The last accepted document stayed unchanged.
- **PASS, native geometry.** Strict topology retained two passages, the original 62 faces and 48 joins, and every recorded incidence ID. The outlet remained at (36, 38, 0) mm. Independent section and path integration agreed with volumes 2403.964473723, 2147.964473723 and 2307.964473723 mm³ and all three centroid coordinates within `1e-8`. Focused checks also retained the signed native recipe and refused a coincident target.
- **PASS, regression and build.** 40 Model tests, 2 Studio tests, scoped ESLint, Studio types and production build, and 20 recorded source-frozen desktop states across the inlet and the controls for the original outlet and its existing local MCP proposal.
- **FAIL.** None in the affected checks.
- **NOT_RUN.** Full local suites, mobile, paid providers, multi-cap edits and general Sweep face editing. The wider #17 stays open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-handle offset-to-plane offset-plane-retention native-offset-face tool-contract paired-elbow-outlet-plane-proposal-review
pnpm --dir apps/cad-studio test offset-face-hud offset-plane
pnpm --dir apps/cad-studio build
D1858_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/inlet" --inlet
D1854_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/outlet"
D1855_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/agent" --agent
git diff --check
```
