# D2086 — Replace a Pivot face fixed edge in History

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `315c526429731c3209cc029c50ec6221399471f4`.

Use **History → Edit pivot face → Fixed edge** to change the hinge on the same original planar stock face. Studio reads the input body at the saved feature's History position. The selector identifies the four eligible edges by the adjacent stock supports. The edit retains the angle, feature ID, and face reference. It derives the signed pull from the new support and replaces the old edge signature with the new edge signature. The same exact native edge checks now serve initial creation and History editing.

## Verification

- **PASS, baseline reproduction.** Desktop Studio creates a 12° Pivot around the upper front edge. The accepted History feature offers only an angle field on the base commit.
- **PASS, actual desktop Chrome WebGPU.** History offers the four adjacent edges of the original face and excludes the nonadjacent rear upper edge. Changing Z max to Z min previews the lower hinge. Cancel retains the accepted upper hinge. Apply changes the fixed edge in the same feature, with 12° retained. Undo and Redo restore the corresponding documents. Save and fresh Open restore the lower-hinge geometry and selector. The browser run freezes 1,263 files and reports zero source changes, page errors or console errors.
- **PASS, native checks.** Independent coordinates place the fixed 40 mm edge at Y=−3 mm and Z=18 mm before the edit and at Y=−3 mm and Z=6 mm after it. The new fixed edge retains its original native edge ID `n1_e0`, curve, vertex IDs and two incident face uses. All eight vertices match the independent trigonometric construction within 0.000001 mm. Both shapes are strict closed solids with six faces, twelve edges and eight vertices. Their symmetric volumes agree with 8,987.837102 mm³ within 0.000001 mm³. The replacement stores only the current face and edge signatures.
- **PASS, affected checks.** All 71 Model tests and seven Studio tests pass. The focused Model regression rejects the rear edge and a stale document, preserves the document on a no-op, and evaluates all three replacements. Model and Studio type checks, scoped ESLint, browser driver syntax, diff checks and the Studio production build pass.
- **FAIL, first test type check.** TypeScript inferred an implicit `any` for the regression's edited document. An explicit `StudioDoc` annotation fixes the test, and the final type check passes.
- **NOT_RUN.** Direct viewport picking for this History action, local Agent replacement, downstream feature chains, full local suites, mobile and live providers. The wider direct-edit issue #629 remains open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop runs and the build.
PIVOT_HINGE_HISTORY_FROZEN=1 node apps/cad-studio/test/pivot-hinge-history-browser.mjs "$OUT/baseline" --baseline
PIVOT_HINGE_HISTORY_FROZEN=1 node apps/cad-studio/test/pivot-hinge-history-browser.mjs "$OUT/candidate"
pnpm --dir packages/barocss-cad-model test draft-command-pull api-draft-pull references toolset tool-contract
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp draft-neutral-feedback
```
