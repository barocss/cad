# Transform gizmo presentation

Owner request: make the CAD gizmo look complete and professional while preserving its existing manipulation contract.

## Bounded change

Solid arrowheads and a consistent dark silhouette distinguish handles against both the model and viewport. Visible move axes have XYZ labels, so axis identification does not depend only on color. Plane handles use their normal-axis color. Move arrowhead geometry stays fixed on hover; emphasis changes through color and shaft width. The origin remains a non-interactive reference, not a new pivot tool. Rotation arrowheads use the same outline. Feature handles retain their existing classes and behavior with the shared solid-head treatment. The drag readout retains tabular figures.

No hit-test, layout, drag math, snap, typed value, model, persistence or kernel changes. No full-ring rotation, pivot relocation or accessibility certification is claimed.

## Verification

- PASS: gizmo unit and presentation tests, 8/8 (Node 22.19.0).
- PASS: actual desktop Chrome/WebGPU Studio, 1440 × 1000. Box Move idle/hover/drag; Cancel preserves original document; typed Apply and Undo restore original; Rotate Z drag gives -30° and Cancel restores original; front orthographic and zoom; XZ plane drag gives ΔX=1 and ΔZ=1; light/dark appearance. No console/page errors or frozen-source changes. Browser/context/server closed.
- PASS: final Model and Studio TypeScript checks after test edits.
- PASS: direct visual inspection of baseline and final Move, Rotate, plane-drag and light-theme images; independent review found no blocking issue.
- NOT_RUN: whole-suite, production build, mobile, all feature-handle families, OS pointer cancellation, Save/Open and release/deployment. Existing arithmetic and end-on handling are untouched.

Actual qualification base: `7568ddd5937373a38e6e29db701c7b179feee2fb`. Final GizmoMarks SHA256: `bf19697f12f21684690ff201b63ca59e181c4c00bf84fef2d24ba6677fa0500e`, equal to the frozen runtime source. Subsequent fast-forward to `760ce761e` adds the independently qualified nested Assembly.meshes API repair; no gizmo paths conflict. This does not relabel the earlier actual run as a rerun after integration.

First expanded driver failed because Undo clears body selection; Rotate correctly refused without a body. The driver now explicitly reselects. One later run was deliberately interrupted to yield the shared heavy slot. Final run passed. Raw images/logs stay outside Git.

Commands: `node test/gizmo-visual-browser.mjs <output>` with `GIZMO_SOURCE_FROZEN=1`, existing PW_DIR/CHROME and heavy gate; `node scripts/test.mjs gizmo`; `tsc -p packages/barocss-cad-model/tsconfig.json --noEmit`; `tsc -p apps/cad-studio/tsconfig.json --noEmit`.
