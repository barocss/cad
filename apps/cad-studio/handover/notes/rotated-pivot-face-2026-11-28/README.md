# D2088 — Pivot a face after the original stock rotates

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `aaeab07967d5ac5817bc5c86b959f705fd6466b1`.

Pivot face accepts one original rectangular extrusion after a chain of authored Move and Rotate features. In this path the saved hinge and its adjacent original stock face determine the pull. The feature omits the optional world-axis pull and keeps its current native document format. An explicit pull still means a signed world axis. The kernel proves the original rectangle, matches its native face and edge incidence, and rebuilds the moving face in the original stock frame. The fixed world edge, curve and vertices retain their complete records. History and local MCP use the same original stock selection.

## Verification

- **PASS, baseline reproduction.** Desktop Chrome WebGPU selects the face and original straight edge of the stock after Move, X Rotate and Move. The command is unavailable on the base commit. The rotated source stays unchanged.
- **PASS, actual desktop Chrome WebGPU.** The candidate opens Pivot face with the same viewport picks and applies 12°. History changes the fixed edge from Original top to Original bottom. Undo and Redo restore their respective documents. Editing the upstream Rotate from 31° to 43° moves the body and the same fixed edge together. Native Save and fresh Open retain the lower hinge and 12° in History. The run freezes 1,265 files and reports zero source changes, page errors or console errors.
- **PASS, exact geometry.** The lower edge keeps `prismatic_e0`, its native curve, both vertex records and both incident face uses. The 40 mm edge spans X=27 to 67 mm. Editing the Rotate moves it from Y=−6.767110 and Z=6.736692 mm to Y=−4.758839 and Z=6.155891 mm. All eight corners, the tilted support normal and the 8,987.837102 mm³ volume match independent calculations within 0.000001 in mm and mm³. The moving support contains the hinge within 0.000000001 mm. All outputs are strict closed solids with six faces, twelve edges and eight vertices.
- **PASS, local MCP.** The original rotated face and edge produce a revision-pinned 12° proposal with the expected net volume change. An edge outside the selected face is refused, and the valid proposal leaves the source feature tree unchanged while pending.
- **PASS, affected checks.** 51 kernel, 73 Model and seven Studio tests run on Node 22.19.0. The new kernel tests include all six original supports, mixed Rotate axes, nonzero pivots, both angle signs, unsupported source and collapse refusal, coordinate limits, and native round trips. Kernel, Model and Studio type checks, scoped ESLint, browser driver syntax, diff checks and the Studio production build pass.
- **FAIL, repository code-shape baseline.** The check reports existing counter overruns in six B-rep files. Those files, all other watched directories, the checker and its baseline match the base commit.
- **NOT_RUN.** Studio approval of the rotated Agent proposal, placed assemblies, downstream feature chains, full local suites, mobile and live providers. The wider direct-edit issue #629 remains open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop runs and the build.
ROTATED_PIVOT_FACE_FROZEN=1 node apps/cad-studio/test/rotated-pivot-face-browser.mjs "$OUT/baseline" --baseline
ROTATED_PIVOT_FACE_FROZEN=1 node apps/cad-studio/test/rotated-pivot-face-browser.mjs "$OUT/candidate"
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{rotated-pivot-face,draft-neutral-plane,drafted-extrusion,drafted-cap-offset,api-part}.test.mjs
pnpm --dir packages/barocss-cad-model test draft-command-pull api-draft-pull references toolset tool-contract
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp draft-neutral-feedback
```
