# D1477 — Anchor the Constant Fillet handle to the selected circular arc

P4, row 20, [#214](https://github.com/barocss/cad/issues/214). Base: `2c1bcee1b6482baf003099ee30cf52f72e36cb71`.

The new Fillet handle usually starts at the midpoint of its display edge endpoints. On the original circular rim of a quarter-sector prism this puts the radius handle 2.34314575 mm inside the intended location. When Model builds a display edge for one original rational circular span, it can read both native side supports. For an outward cylinder with a coaxial planar cap, evaluate the native curve midpoint and use the exact radial and cap normals for the scalar direction. Supply this frame to a new Circular Constant Fillet on one picked edge. Remove the frame when edges are merged or placed. Radius limits, snap, the saved recipe and solver stay unchanged.

## Verification

- **FAIL, original Studio alignment.** On unmodified runtime, the actual R0.6 handle in Top Ortho is 129.7107 CSS px from the analytic arc-based position and 0.00001 CSS px from the chord-based position. Iso error is 99.5863 CSS px.
- **PASS, fixed actual Studio.** Picking the same native quarter-circle at R0.6 gives 0.000030 CSS px error in Top and 0.000059 CSS px in Iso. Dragging the actual handle takes the radius to 1.5 mm. The visible preview leaves the source document unchanged. The released handle stays within 0.000030 CSS px of the independent position.
- **PASS, native and file.** Apply stores `n1.side1|n1.top` and R1.5. The strict one-body B-rep, all four native trim curves, and five independent sections of the toroidal profile pass. Maximum section error is 3.77e-13 mm. Native and Worker volume agree with the analytic 496.8412259069109 mm³ to 2.15e-10 mm³. Undo restores the exact source. Redo, typed R1.5, Save and fresh Open preserve the exact native digest.
- **PASS, controls.** The actual two-straight-edge Studio flow, 13 focused Model checks, 37 focused Studio checks, scoped lint, Model typecheck, Studio production build, script syntax and diff checks pass. The focused Model check also covers legacy placement of other radius modes and Chamfer, and removal of the new frame from placed geometry.
- **FAIL, pre-existing test expectation.** The wider `feature-handles` selection also runs its old Offset Face validation assertion. The baseline archive reproduces the same sole failure (14 pass, 1 fail): the assertion needs `/a distance/`, while the earlier validation already says “a nonzero signed distance”. This result is unrelated to the Fillet change.
- **NOT_RUN.** Curved History Fillet, closed or merged rims, arbitrary curves, multiple curved edges, alternate desktop GPU backends, mobile and full local suites. #214 stays open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Run heavy checks through the shared gate. Freeze worktree writes during browser runs. Keep all screenshots and logs outside Git.

```sh
node --check apps/cad-studio/test/circular-fillet-radius-handle-browser.mjs
git diff --check
node packages/barocss-cad-model/scripts/test.mjs circular-fillet-handle api-variable-fillet fillet-equal-endpoint-mode
node apps/cad-studio/scripts/test.mjs scalar-handle-drag history-fillet-radius-receipt gizmo
pnpm exec eslint packages/barocss-cad-model/src/app/commands.ts packages/barocss-cad-model/src/engine/{evaluate,mesh,nativeCircle}.ts packages/barocss-cad-model/test/circular-fillet-handle.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
# Before the correction, use the same browser driver at the original runtime.
CIRCULAR_FILLET_HANDLE_FROZEN=1 node test/circular-fillet-radius-handle-browser.mjs "$EVIDENCE/baseline" --baseline
CIRCULAR_FILLET_HANDLE_FROZEN=1 node test/circular-fillet-radius-handle-browser.mjs "$EVIDENCE/qualified"
FILLET_END_ON_SOURCE_FROZEN=1 node test/fillet-end-on-handle-browser.mjs "$EVIDENCE/straight-control" --two-edges
```
