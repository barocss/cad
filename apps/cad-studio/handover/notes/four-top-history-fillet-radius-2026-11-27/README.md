# D2058 — Anchor the shared History radius to the first of four upper box rims

P1 [row 7](../../roadmap-rows/07.md) and [row 20](../../roadmap-rows/20.md) · FEATURE · [#214](https://github.com/barocss/cad/issues/214). Product base `efc9fe7ddb5fb40d58e763f9808bf390fe426e94`. Use the 12 × 8 × 8 mm rectangular seed dimensions from [D2057](../joined-rectangular-boss-pattern-2026-11-27/README.md) as a standalone Box Extrude, with one terminal constant circular Fillet.

- **FAIL, previous desktop History.** Create the original four-edge Fillet with R1. The prior radius handle used the merged display face and sat 293.707850 CSS px from the first picked rim in the same isometric view.
- **PASS, Chrome/WebGPU.** The verified grip is 0.000027 CSS px from the expected first rim anchor, `n1.side1|n1.top`. A 10 mm guide projects to 0.000036 CSS px in the end-on view. One captured pointer moves R1 → R2 → R1 → R2. Release keeps R2; Cancel preserves R1. Apply changes only the radius. An oversized R20 edit is refused while Redo stays available. Undo, Redo, typed R2, and native Save/fresh Open preserve the authored references.
- **PASS, native geometry.** Each rim has one original wall/cap pair, one exact quarter-cylinder support and opposing fit checks for the two adjacent corner seams. The finished R2 solid has one genus-zero shell, 10 faces, 24 edges and 16 vertices. It has volume 736.7315570194866 mm³ and four cylinders at the expected positions and axes. Independent volume for width `W`, depth `D`, height `H` and radius `r` is `HWD − 2(W + D)(1 − π/4)r² + 4(5/3 − π/2)r³`. Drag, numeric edit and fresh Open give the same native digest. The proof rejects changed topology at opposite-round contact, misplaced supports, and wrong or missing native owners.
- **PASS, affected checks.** Studio 60 checks, Model 12, pinned TypeScript 5.9.2, scoped ESLint, browser syntax, diff check and the Studio production build pass. Actual Chrome reproduces the previous two-edge History drag and fresh Open as a control. The first Studio test run had 59/60 before the direction assertion used the same numeric tolerance as the neighboring receipt tests. Shared evidence and four-rim handling now live in their own modules.
- **NOT_RUN.** Full local suites, mobile, downstream patterned or placed Fillet interaction, and comparative pointer latency. First mechanical CAD remains 8/10. Overall CAD remains unmeasured. Confirm the remaining original #214 criteria before closing it.

```sh
D2058_SOURCE_FROZEN=1 node apps/cad-studio/test/box-top-fillet-history-browser.mjs "$OUT/baseline" --baseline
D2058_SOURCE_FROZEN=1 node apps/cad-studio/test/box-top-fillet-history-browser.mjs "$OUT/candidate"
FILLET_END_ON_SOURCE_FROZEN=1 node apps/cad-studio/test/fillet-end-on-handle-browser.mjs "$OUT/control" --history-pair
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag command-drag-wall fillet-history-identity
pnpm --dir packages/barocss-cad-model test native-box-top-fillets native-fillet-pair
node "$TSC_592" --noEmit -p packages/barocss-cad-model
node "$TSC_592" --noEmit -p apps/cad-studio/tsconfig.json
pnpm --dir apps/cad-studio build
git diff --check
```

Desktop receipt SHA-256 is `a8ff7f56960c1f4c8b036b5a2567432df73fd9781ab4fafe712fdc1d640e30e5` for baseline, `bbe9c3bf263098d1742da3d4cfa63647f15fa8dff6bf0a750803b7d0fb94745c` for the fixed case and `4763e55c4dd5eca26ee61e4e46811eb8f7981926abdaade92c9ddc84a0d662e6` for the two-edge control.
