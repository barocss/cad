# D1509 — Edit one History Fillet radius on opposite original top edges

P4, row 20, [#214](https://github.com/barocss/cad/issues/214). Base `582c8e0907cca2800995009144bfe5f3c8f6fcb7`.

A constant History Fillet on the opposite X-parallel top edges of a plain rectangular extrusion now uses one original-edge handle. The handle starts at the midpoint of the canonical side0 edge and extends outward by the current radius. The original signed references must match an exact, current Worker read. The accepted result must have both resolved targets and two outward native cylinders. Each cylinder must match exactly one original joint by axis and radius. The guard accepts either authored edge order. Until proof arrives, users can type the radius in History. The existing scalar gesture keeps the established pointer-down sensitivity and command validation.

## Verification

- **PASS, actual desktop reproduction.** On 40 × 30 × 10 mm stock, the previous History handle was 35.15295 CSS px from the original-edge anchor. The 24 CSS px upward drag with a 0.00000458 CSS px projected radius axis kept R2. The history recipe remained unchanged during the gesture.
- **PASS, actual desktop Studio.** The anchor error is 0.00006098 CSS px. The same 24 CSS px upward drag at 16.39295 CSS px/mm produces R3.5 with the existing half-step rounding. Cancel preserves R2. Apply changes only the stored common radius and retains both edge names and signatures. Undo/Redo preserve the recipes. Typed R3.5 and native Save and fresh Open reproduce the same native digest, `fb47a5b98b114c2cb49be217ccd6e124a5ed26f4392de1704faf7440d0f673d1`.
- **PASS, independent native checks.** Strict B-rep confirms one body. Each of two cylinders retains four trims, the correct four end contact points and the quarter-arc midpoint across both target edges. Native and Studio volumes match `12000 − 80 (1 − π/4) r²` within 1e-7 mm³, from 11931.327412287184 mm³ at R2 to 11789.690200129502 mm³ at R3.5.
- **PASS, source and refusal checks.** Reversed authored order, adjacent edges, missing source, forged signature, wrong target, duplicate cylinder, wrong axis/radius/centre, missing result face and placed copies have focused coverage. One independent geometry review and the follow-up source review pass.
- **PASS, affected checks and controls.** 18 targeted Model tests, 71 Studio tests, scoped lint, Model and Studio types, Studio build, browser-driver syntax and Git diff checks. The actual single circular History and the two-edge creation controls also pass.
- **FAIL, wider legacy Model suite.** One existing `feature-handles` assertion expects `/a distance/` for zero Offset face. The source returns `Offset face needs a nonzero signed distance within ±10000 mm.` The same assertion fails with the parent evaluation module. The Fillet cases pass.
- **NOT_RUN.** Other edge pair orientations, adjacent/nonparallel and arbitrary curved History drags, pair-specific delayed Worker delivery in Chrome, additional browsers, mobile, and full local suites. #214 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Run heavy checks through the shared gate. Freeze worktree writes during Studio. Store evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs filletNames fillet-radius-mode-history circular-fillet-handle rematch
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag gizmo command-drag-wall fillet-history-identity
pnpm exec eslint apps/cad-studio/src/app/useHistoryFilletRadius.ts apps/cad-studio/src/state/historyFilletRadiusReceipt.ts apps/cad-studio/src/viewport/{GizmoMarks.tsx,gizmo.ts,scalarHandleDrag.ts,useCommandGizmos.ts} apps/cad-studio/test/history-fillet-radius-receipt.test.ts packages/barocss-cad-model/src/engine/{evaluate,nativeFilletPair}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/fillet-end-on-handle-browser.mjs
git diff --check
cd apps/cad-studio
FILLET_END_ON_SOURCE_FROZEN=1 node test/fillet-end-on-handle-browser.mjs "$EVIDENCE/parent" --history-pair-baseline
FILLET_END_ON_SOURCE_FROZEN=1 node test/fillet-end-on-handle-browser.mjs "$EVIDENCE/pair" --history-pair
CIRCULAR_FILLET_HANDLE_FROZEN=1 node test/circular-fillet-radius-handle-browser.mjs "$EVIDENCE/circular-history-control" --history
FILLET_END_ON_SOURCE_FROZEN=1 node test/fillet-end-on-handle-browser.mjs "$EVIDENCE/creation-pair-control" --two-edges
```

Run the first browser command before the product change. All browser commands use separate output directories.
