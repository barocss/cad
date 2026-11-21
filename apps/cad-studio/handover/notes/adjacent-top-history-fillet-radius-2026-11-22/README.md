# D1595 — Drag one History radius for two adjacent top fillets

P4, row 20, [#214](https://github.com/barocss/cad/issues/214). Base `51807a6f669fcbb21f7f202343c6185993ced10d`.

For the front and right top edges of a plain rectangular extrusion, use the original front edge midpoint and outward bisector for one shared History radius handle. Admit the handle after the current Worker confirms both original edge signatures and the same accepted native fillet pair. The Model certifies the two outward quarter-cylinder control nets, their supporting planes, real trim twins and sampled fits of both shared seam segments. The typed radius remains available before source proof arrives.

- **FAIL, previous desktop behavior.** On the 40 × 30 × 10 mm stock, the legacy handle is 190.303940 CSS px from the expected original anchor. A 24 CSS px upward drag gives R4 mm at the fixed end-on camera. The saved radius stays R2 mm because the gesture is unapplied.
- **PASS, desktop Studio WebGPU.** At the matched camera, the original anchor error is 0.000060973 CSS px. The original radius axis projects to 4.581e−6 CSS px. A 24 CSS px upward drag with 16.392950 CSS px/mm changes R2 to R3.5 mm. Cancel keeps R2. Apply keeps both original names and changes only the radius. Undo, Redo, typed R3.5, Save and fresh Open retain exactly the same native digest for the accepted result.
- **PASS, native geometry.** Both rounds keep the specified perpendicular axes, radii and shared native boundaries. Each round has five trim edges. Two fitted cubic segments join the side and cap intersections. Their sampled radial deviations stay below 1e−7 mm. The independent intersecting strip integral gives 11940.678448470258 mm³ at R2 and 11820.089365935313 mm³ at R3.5. Native and Studio volumes agree within 1e−11 mm³.
- **PASS, focused controls.** 19 Model and 72 Studio tests, Model types, scoped lint, Studio types and build, syntax and Git diff. Cases include reversed target and native face order, unrelated or stale sources, a missing adjacent certificate, a changed shared seam inside its diagonal plane, and the existing opposite-edge path. Final Studio receipts have zero runtime errors, console errors and source changes.
- **FAIL, initial types corrected.** The mutation fixture originally mapped the typed array members to mutable objects. Keep the native typed arrays intact. Import the vector type used by the Studio receipt.
- **NOT_RUN.** More than two edges, other adjacent orientations, curved original edges, a new opposite-edge desktop proof, other renderers, mobile and full local suites. #214 remains open.

Use Node 22.19.0, installed desktop Chrome and Playwright. Gate heavy checks and keep captures outside Git.

```sh
FILLET_END_ON_SOURCE_FROZEN=1 node apps/cad-studio/test/fillet-end-on-handle-browser.mjs "$BASELINE" --history-adjacent-baseline
FILLET_END_ON_SOURCE_FROZEN=1 node apps/cad-studio/test/fillet-end-on-handle-browser.mjs "$EVIDENCE" --history-adjacent
pnpm --dir packages/barocss-cad-model test native-fillet-pair filletNames fillet-radius-mode-history circular-fillet-handle
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag gizmo command-drag-wall fillet-history-identity
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint apps/cad-studio/src/{app/useHistoryFilletRadius,state/historyFilletRadiusReceipt}.ts apps/cad-studio/test/{history-fillet-radius-receipt.test.ts,fillet-end-on-handle-browser.mjs} packages/barocss-cad-model/src/engine/nativeFilletPair.ts packages/barocss-cad-model/test/native-fillet-pair.test.ts
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/fillet-end-on-handle-browser.mjs
git diff --check
```

Run the baseline command on the base source with the current driver. Run the second command after the product change.
