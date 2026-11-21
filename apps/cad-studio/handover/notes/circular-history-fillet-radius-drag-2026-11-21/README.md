# D1505 — Drag a History Fillet radius from the original circular rim

P4, row 20, [#214](https://github.com/barocss/cad/issues/214). Base `88e8c9c3d6e06b9120f3c5dba73b4fdf6b8b63e8`. Retain the D1477 R8 quarter-sector prism, height 10 mm, one Constant Fillet on its upper circular rim.

Admit the plain three-segment sector and one terminal constant-radius finish. Read the current native parent. Require one unmerged named edge, the kernel's open quarter-rim check, the saved reference signature, and the current accepted solid's single toroidal result on that edge. Verify its axis, centre and both radii. Anchor the History drag at the source arc's native midpoint plus the accepted radius along the cap and wall bisector. Freeze the pointer conversion when the drag starts. A press awaiting proof cannot start a drag after proof arrives.

## Verification

- **FAIL, original desktop behavior.** The R0.6 History handle lands 61.7532943 CSS px from its original rim-based anchor. It has no verified end-on scalar control. History typed R1.5 still produces the expected native result.
- **PASS, actual desktop Studio.** The fixed Top anchor differs from the analytic projection by 0.000034 CSS px. The end-on 1.4 mm radius-line sample projects to 0.000004 CSS px at 43.1788391 CSS px/mm. The physical upward drag reaches R1.5 and retains it on release. Cancel preserves R0.6. A real source reply held by the harness and delivered during a pending press does not promote that press into a drag.
- **PASS, exact native result.** Apply changes only the existing radius to 1.5 on `n1.side1|n1.top`. Strict B-rep check, four native trims and five independent toroidal sections pass. The largest section error is 3.77e-13 mm. Native volume is 496.8412259066968 mm³; the native and Studio Worker volumes agree with the analytic volume within 2.15e-10 mm³. Undo/Redo, typed radius, Save and fresh Open preserve the exact native digest.
- **PASS, affected checks.** 41 Studio and 13 Model tests, scoped lint, Model types, Studio types and build, browser syntax and Git diff checks. The existing new circular and new straight Fillet drag controls pass.
- **NOT_RUN.** Other curved History edge families, multi-edge History Fillets, other renderers, mobile, full kernel suites and timing qualification. #214 stays open for its remaining cases.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy checks, freeze worktree writes during Studio and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs history-fillet-radius-receipt scalar-handle-drag gizmo
node packages/barocss-cad-model/scripts/test.mjs circular-fillet-handle api-variable-fillet fillet-equal-endpoint-mode
pnpm exec eslint apps/cad-studio/src/{app/useHistoryFilletRadius.ts,state/historyFilletRadiusReceipt.ts,viewport/{GizmoMarks.tsx,gizmo.ts,scalarHandleDrag.ts,useCommandGizmos.ts}} apps/cad-studio/test/history-fillet-radius-receipt.test.ts packages/barocss-cad-model/src/engine/{evaluate,mesh,nativeFilletTorus}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/circular-fillet-radius-handle-browser.mjs
git diff --check
cd apps/cad-studio
export CIRCULAR_FILLET_HANDLE_FROZEN=1
# Run the baseline on the original runtime.
node test/circular-fillet-radius-handle-browser.mjs "$EVIDENCE/original" --history-baseline
node test/circular-fillet-radius-handle-browser.mjs "$EVIDENCE/history" --history
node test/circular-fillet-radius-handle-browser.mjs "$EVIDENCE/new-circle"
FILLET_END_ON_SOURCE_FROZEN=1 node test/fillet-end-on-handle-browser.mjs "$EVIDENCE/new-straight"
```
