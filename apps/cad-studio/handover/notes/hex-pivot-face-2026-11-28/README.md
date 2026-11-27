# D2090 — Pivot an original hexagonal extrusion wall

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629), [#14](https://github.com/barocss/cad/issues/14) · Base `de7b707a3c81a3310ba1428d98f63433092c58f8`.

Pivot face accepts an original side wall and either adjacent cap edge of one straight convex hexagonal extrusion, including after Move. The exact world-Z cap determines the signed pull. The kernel keeps the selected cap and hinge fixed and intersects the new plane with the two original adjacent walls. The existing wall replacement section checks, chart extension and native trim binding certify the result. History offers the two original cap edges, and the normal viewport angle handle remains available.

## Verification

- **PASS, baseline reproduction.** The old Studio selects the oblique side and its original bottom edge but leaves Pivot face unavailable. The stock remains unchanged.
- **PASS, actual desktop Chrome WebGPU.** The new workflow previews the bottom-edge pivot and supports Cancel and Apply. In History, 44° would collapse the cross section and disables Apply. The accepted body remains unchanged. History changes the fixed edge to Original top and applies −11.309932474°. Undo, Redo, Save and fresh Open restore the accepted geometry and editable hinge. The run freezes 1,264 files with zero source changes, page errors or console errors.
- **PASS, exact native geometry.** The moving side pivots about the selected full 10 mm native edge. The complete fixed edge, curve, vertex records and incident uses agree with stock. Ten of twelve vertex records remain identical. The other seven face supports retain their normals and distances, and every native topology and parameter-curve ID is retained. The strict closed solid keeps eight faces, eighteen edges and twelve vertices.
- **PASS, independent measurements.** The bottom hinge at +11.309932474° has volume 3,733.055556 mm³. The top hinge at −11.309932474° has volume 3,933.055556 mm³. Studio and native volumes agree with the integrated cross sections within 0.00000001 mm³. The bottom-hinge centroid agrees with the independent calculation, and all twelve corners agree within 0.00000001 mm. Reopened volume, topology and hinge match the accepted top-hinge geometry.
- **PASS, local MCP.** The original source face and its cap edge produce a revision-pinned proposal with the expected volume change. A vertical edge on the same wall is refused. The valid pending proposal leaves the source feature tree unchanged.
- **PASS, affected checks.** All 53 kernel, 103 Model and 31 Studio tests pass on Node 22.19.0. Kernel, Model and Studio type checks, scoped ESLint, browser driver syntax, diff checks and the Studio production build pass. Existing prism offset, plane replacement, ordinary Draft and rotated Pivot cases pass their affected regressions.
- **FAIL, corrected harness attempts.** The first baseline inspector had a misspelled package import. The first candidate kept a locator from the old browser page after fresh Open. The final baseline and candidate runs correct those harness errors.
- **NOT_RUN.** Studio approval of the hexagonal Agent proposal, Rotate on the hexagonal source, broader convex profiles, full local suites, mobile and live providers. Both wider issues remain open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop runs and the build.
HEX_PIVOT_FACE_FROZEN=1 node apps/cad-studio/test/hex-pivot-face-browser.mjs "$OUT/baseline-final" --baseline
HEX_PIVOT_FACE_FROZEN=1 node apps/cad-studio/test/hex-pivot-face-browser.mjs "$OUT/candidate-final"
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{hex-pivot-face,prism-wall-offset,draft-neutral-plane,rotated-pivot-face}.test.mjs
pnpm --dir packages/barocss-cad-model test draft-command-pull pivot-face-handle api-draft-pull references toolset tool-contract native-offset-face replace-face
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp draft-neutral-feedback offset-hex-side-feedback gizmo
```
