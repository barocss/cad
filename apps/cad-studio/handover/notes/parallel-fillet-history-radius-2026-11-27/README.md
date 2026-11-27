# D2056 — Anchor a shared History radius to three original vertical edges

P1 [row 7](../../roadmap-rows/07.md) and [row 20](../../roadmap-rows/20.md) · FEATURE · [#214](https://github.com/barocss/cad/issues/214). Product base `7e9aa620bc2c06af871d850fcf899b2a8fa12d24`. Use the original 590 mm² polygon extruded 3 mm from [D1870](../triple-held-fillet-history-replacement-2026-11-24/README.md) with a literal constant Fillet radius.

- **FAIL, previous desktop History.** Actual viewport creation already used one shared radius on the three clicked straight edges. In History the generic handle picked the first displayed round, 525.180 CSS px from the first authored edge in the same view. It had no verified original-edge drag frame.
- **PASS, actual desktop Chrome/WebGPU.** Create the three-edge Fillet by dragging R0.5 to R1. History now puts the shared handle within 0.001 CSS px of the expected first authored edge. A drag at less than 0.001 CSS px of projected length per 10 mm reliably changes R1 to R2. Cancel preserves R1. Explicit Apply changes only the radius. Undo, Redo, typed R2 and native Save/fresh Open retain the same native result.
- **PASS, native reference and geometry.** A current worker sidecar pairs each resolved original edge with an exact outward vertical cylinder and its native face ID. Caps and adjacent wall twins identify the source, while the original-edge proof checks its endpoints, exact signature, shared height and expected cylinder axis location. This admits the handle only after the three witnesses agree. The original edge order is preserved. Independent volume is `3 × [590 − 3(1 − π/4)r²]` mm³. R2 gives 1,762.2743338823 mm³ and one strict solid with 13 faces, 33 edges and 22 vertices. The three real cylinder axes agree with the expected centres. Drag, numeric entry and fresh Open produce the same strict native digest.
- **PASS, affected checks.** Studio 59 checks including the expanded receipt checks, Model 29/30, pinned Model and Studio TypeScript 5.9.2, scoped ESLint, syntax, diff check and Studio production build. The two-edge History desktop control passes. Duplicate, swapped and missing witnesses and placed output cannot claim the verified frame.
- **FAIL, initial Studio types.** The pending grip status needed the new group variant in the shared consumer. The corrected type check and production build pass.
- **FAIL, existing baseline.** Model `feature-handles` Draft test 13 also fails on the exact prior Model source with the same assertion. The Fillet checks pass.
- **NOT_RUN.** Full suites, mobile, other polygon/edge families, performance comparison and remaining #214 interaction cases. First mechanical CAD remains 8/10. Overall CAD remains unmeasured.

```sh
D2056_SOURCE_FROZEN=1 node apps/cad-studio/test/parallel-fillet-radius-browser.mjs "$OUT/baseline" --baseline
D2056_SOURCE_FROZEN=1 node apps/cad-studio/test/parallel-fillet-radius-browser.mjs "$OUT/final"
FILLET_END_ON_SOURCE_FROZEN=1 node apps/cad-studio/test/fillet-end-on-handle-browser.mjs "$OUT/control" --history-pair
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag command-drag-wall fillet-history-identity
pnpm --dir packages/barocss-cad-model test feature-handles native-fillet-pair fillet-radius-mode-history
node "$TSC_592" --noEmit -p packages/barocss-cad-model
node "$TSC_592" --noEmit -p apps/cad-studio/tsconfig.json
pnpm --dir apps/cad-studio build
git diff --check
```

Desktop receipt SHA-256: previous `ed4791b1e279d76e160c0b873a7a406ef262922c105b1b1b8d66ea13e7ccc84c`, fixed `11d20c476cd137d767ae2c5bb9be56e414b0dd9456acf8f8d4a7d426da529468`, two-edge control `f53cf0d06e0d86abf8074264867f885ff80537216dbb6b66f02ed1066467d4e9`.
