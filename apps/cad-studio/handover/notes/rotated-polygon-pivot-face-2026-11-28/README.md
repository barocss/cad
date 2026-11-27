# D2092 — Pivot a convex polygon wall after Rotate

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629), [#14](https://github.com/barocss/cad/issues/14) · Base `a41d7ac20ec20c341de7449d68f0d4c1267eca0c`.

Pivot face can tilt an original straight convex polygon extrusion wall about an original cap edge after authored Move and Rotate. The omitted pull follows the original cap. The saved feature uses the existing fields. The kernel proves the cut in the original stock frame, transports the two moving corners through the rigid placements and rebinds the trims on the affected world faces. Face, edge and vertex incidence identifies the source. History only offers the two cap edges for this polygon path. Explicit pull still means a signed world axis. Established rectangular Pivot retains its path.

## Verification

- **PASS, baseline reproduction.** Desktop Chrome WebGPU selects the original wall and upper cap edge after Move, X Rotate and Move. The prior Studio leaves Pivot face unavailable.
- **PASS, actual desktop Chrome WebGPU.** The octagon previews and applies +11.309932474° about Original top. In History, +24° about Original bottom is refused and Cancel preserves the accepted part. −11.309932474° about Original bottom applies. Undo and Redo restore the respective native documents. An upstream 31° to 43° Rotate edit moves the same lower hinge with the part. Save and fresh Open retain the edited angle and Original bottom. The candidate freezes 1,265 files and reports zero source changes, page errors or console errors.
- **PASS, exact native geometry.** At each accepted state, the native fixed edge, curve, vertices and incident uses are identical to the corresponding original placed stock. The fixed cap retains its surface and all eight coedge parameter curves. All face, loop, edge, vertex, curve, shell, body and parameter-curve IDs keep their owners. Fourteen of sixteen vertex records are unchanged. All sixteen positions and the tilted support agree with the independent rotated section within 0.00000001 mm. The upper +11.309932474° case has volume 8,240/3 mm³. The lower −11.309932474° case has volume 8,960/3 mm³ before and after the upstream Rotate and fresh Open. The two endpoints keep X at 27 and 39 mm. Their common (Y, Z) in mm changes from (−1.105380, 3.138802) to (1.527212, 3.813764).
- **PASS, affected kernel cases.** Regressions cover triangle and octagon, both signed directions and both cap hinges, X/Y/Z and mixed rotations, nonzero station and pivot, exact fixed trims, and independent positions, normals, volumes and centroids. They verify refusal of a wall-to-wall edge, unrelated cap, unsupported explicit pull and collapsed section. Each right-angle input is checked against its own freshly evaluated prefix. No cross-branch ID stability is claimed for an upstream Rotate that changes the source transform's native representation.
- **PASS, affected checks.** Kernel emit, 62 kernel tests, 105 Model tests, 31 Studio tests, Kernel/Model/Studio type checks, scoped ESLint, browser driver syntax, diff checks and Studio production build on Node 22.19.0.
- **FAIL.** No failures in the recorded baseline, candidate or affected checks.
- **NOT_RUN.** End-to-end Agent approval of this rotated case, full local suites, mobile and live providers. Both wider issues remain open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run desktop and affected build commands under the heavy gate.
ROTATED_POLYGON_PIVOT_FACE_FROZEN=1 node apps/cad-studio/test/rotated-polygon-pivot-face-browser.mjs "$OUT/baseline" --baseline
ROTATED_POLYGON_PIVOT_FACE_FROZEN=1 node apps/cad-studio/test/rotated-polygon-pivot-face-browser.mjs "$OUT/candidate"
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{rotated-polygon-pivot-face,rotated-pivot-face,polygon-pivot-face,hex-pivot-face,prism-wall-offset,draft-neutral-plane}.test.mjs
pnpm --dir packages/barocss-cad-model test draft-command-pull pivot-face-handle api-draft-pull references toolset tool-contract native-offset-face replace-face
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp draft-neutral-feedback offset-hex-side-feedback gizmo
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
