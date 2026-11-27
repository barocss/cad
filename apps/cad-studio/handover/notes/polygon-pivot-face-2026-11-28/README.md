# D2091 — Pivot original convex polygon extrusion walls

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629), [#14](https://github.com/barocss/cad/issues/14) · Base `9d35c3828ea8a29b072fc4ada630d50d16bd4c8b`.

Pivot face accepts an original side wall and either adjacent cap edge of one straight convex polygon extrusion. The authored outline must match the evaluated native loop. The kernel retains the existing plane intersection, cross-section checks and trim binding. History offers both exact original cap edges. The verified prism path keeps signed world-Z pull and existing Move support. Oblique four-sided stock can use the polygon Pivot path. Offset, Replace face and the existing rectangular Draft path retain their admission checks.

## Verification

- **PASS, baseline reproduction.** Real desktop Chrome selects each triangular and octagonal stock wall and its native lower edge. Pivot face is unavailable for both in the original Studio.
- **PASS, actual desktop Chrome WebGPU.** Each stock offers the degree handle, previews and applies a positive tilt about the original bottom edge, and applies a negative History edit about the original top edge. Undo, Redo and fresh Open restore the accepted model and editable hinge. On the octagon, +24° and −32° refuse the edit, disable Apply and preserve the document. There are 1,264 frozen source files and zero source changes, page errors or console errors.
- **PASS, native and independent geometry.** Triangle bottom and top volumes are 1,690 and 2,170 mm³. Octagon bottom and top volumes are 8,240/3 and 8,960/3 mm³. Coordinates and volumes match independent sections within 0.00000001 mm and 0.00000001 mm³, respectively. The exact fixed edge, vertex and curve records, incident uses, all topology and parameter-curve IDs, and every other face support are retained. Four of six triangle vertex records and fourteen of sixteen octagon records are identical. The triangle has 5 faces, 9 edges and 18 coedges. The octagon has 10 faces, 24 edges and 48 coedges. Each remains one closed solid. Kernel checks also cover a triangular collapse, the valid side of each tested bound, Move lineage, oblique four-sided stock and unsupported ownership.
- **PASS, local Agent with desktop approval.** Local MCP creates a pending revision-pinned Pivot proposal for each stock. On the accepted octagon it discovers both original hinges and proposes a switch to Original top at the same angle. MCP declines direct acceptance at L1. Studio previews the exchange and retains the pending document until the explicit user action. Native approval, Undo, Redo and fresh Open agree on the original upper edge and the unchanged 8,240/3 mm³ volume.
- **PASS, affected checks.** Kernel emit, 58 kernel tests, 104 Model tests, 31 Studio tests, scoped ESLint, Kernel/Model/Studio type checks, browser driver syntax, diff checks and Studio production build on Node 22.19.0.
- **FAIL.** No failures in the recorded baseline, candidate or affected checks.
- **NOT_RUN.** Prior authored Rotate on polygon stock, polygon-specific Cancel, full local suites, mobile and live providers. Both wider issues remain open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run desktop and affected build commands under the heavy gate.
POLYGON_PIVOT_FACE_FROZEN=1 node apps/cad-studio/test/polygon-pivot-face-browser.mjs "$OUT/baseline" --baseline
POLYGON_PIVOT_FACE_FROZEN=1 node apps/cad-studio/test/polygon-pivot-face-browser.mjs "$OUT/candidate"
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{polygon-pivot-face,hex-pivot-face,prism-wall-offset,draft-neutral-plane,rotated-pivot-face}.test.mjs
pnpm --dir packages/barocss-cad-model test draft-command-pull pivot-face-handle api-draft-pull references toolset tool-contract native-offset-face replace-face
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp draft-neutral-feedback offset-hex-side-feedback gizmo
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
