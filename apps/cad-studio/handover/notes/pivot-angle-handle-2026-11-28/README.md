# D2089 — Drag a Pivot face angle around its fixed edge

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `52b1c3f09ce0b6147fc64a569db50e586565fd0e`.

Pivot face and its History editor show an angle handle on the original stock. The original native edge and its two planar faces define the direction of rotation. Studio measures drag updates from pointer rays in that rotation plane. Positive angles tilt the selected face inward. Escape or a camera change during the drag restores the starting value and retires the associated preview. Releasing the pointer keeps a preview. Apply commits the feature.

## Verification

- **PASS, baseline reproduction.** Studio previews the 5° Pivot on rotated stock and offers the numeric Angle field. The base commit has no viewport handle.
- **PASS, actual desktop Chrome WebGPU.** A real mouse drag takes the oblique hinge from 5° to +15° in an orthographic view. Escape and wheel zoom each restore 5° with the original accepted document intact. A completed drag previews +15° until Apply. The History handle in a perspective view reaches 0°, which disables Apply, then continues to a valid −5°. Undo and Redo restore the two accepted angles. Native Save and fresh Open restore −5° and its editable viewport handle. The candidate freezes 1,265 files and reports zero source changes, page errors or console errors.
- **PASS, native geometry.** Both approved angles retain `prismatic_e2`, the full curve, both vertex records and both incident face uses. The 40 mm hinge endpoints are [4.986406662, −14, 37.027264018] and [36.931827064, −14, 12.954663092] mm. All eight vertices agree with independently transformed coordinates within 0.000001 mm. The strict closed geometry measures 8,828.306326 mm³ at +15° and 9,851.967351 mm³ at −5°. Reopen reproduces the negative-angle geometry and its original hinge.
- **PASS, affected checks.** 78 Model and 69 Studio tests pass on Node 22.19.0. Model tests cover endpoint direction, world geometry and History ownership. Studio tests cover angle steps, replacement views and hinge rejection, and the existing drag and cancellation paths. Both type checks, scoped ESLint, browser driver syntax, diff checks and the Studio production build pass.
- **FAIL, existing three-side Draft assertion.** The unchanged `feature-handles.test.ts` case expects the three-side box Draft to fail. It passes in the current kernel. A build of the unmodified base reproduces the same sole failure with 14 other cases passing.
- **NOT_RUN.** Mobile, full local suites and live providers. The wider direct-edit issue #629 remains open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop runs and the build.
PIVOT_ANGLE_HANDLE_FROZEN=1 node apps/cad-studio/test/pivot-angle-handle-browser.mjs "$OUT/baseline" --baseline
PIVOT_ANGLE_HANDLE_FROZEN=1 node apps/cad-studio/test/pivot-angle-handle-browser.mjs "$OUT/candidate"
pnpm --dir packages/barocss-cad-model test pivot-face-handle draft-command-pull api-draft-pull references toolset tool-contract
pnpm --dir apps/cad-studio test gizmo fillet-scalar-draft scalar-handle-drag command-drag-wall toolset-mcp tool-contract-mcp draft-neutral-feedback
```
