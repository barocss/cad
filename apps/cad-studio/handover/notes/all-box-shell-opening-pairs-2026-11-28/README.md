# D2099 — Open any two original faces of a rectangular per-face Shell

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `2fbec782ec129675e98254a45a1f3107443ba251`.

An upright original zero-draft rectangular extrusion accepts any two distinct original faces as Per face Shell openings. The four kept walls each have their own thickness. For the new pairs an exact signed cardinal basis uses the established two-opening producer. The kernel then verifies the world rims and support planes. The world slab solid retains the same cavity and supports downstream Split. The existing feature keeps the same document schema.

## Verification

- **PASS, baseline reproduction.** Actual desktop Chrome WebGPU selects Right and Left on the stock, then Right and Back in a separate clean Open. Both prior HUDs have only the uniform Wall field. Source documents stay intact.
- **PASS, actual desktop candidate.** Both pairs preview and cancel, then Apply with four explicit thicknesses and the correct missing wall fields. Setting the 2 mm floor's opposite Top wall to 18 mm refuses because the cavity would close. Editing Top from 5 to 7 mm, Undo/Redo, native Save and fresh Open all pass. Both original openings and the four wall values are present after reopen. Both final desktop runs freeze 1,267 files and report zero source changes, page errors or console errors.
- **PASS, independent native geometry.** The opposite pair's cavity changes from [0,40] × [3,26] × [2,15] to [0,40] × [3,26] × [2,13] mm. Volumes are 12,040 and 13,880 mm³. The adjacent pair's cavity changes from [3,40] × [4,30] × [2,15] to [3,40] × [4,30] × [2,13] mm. Volumes are 11,494 and 13,418 mm³. The independent rectangular cavity, native B-rep and Studio worker agree on volume and centroid. The through shell has genus one with 10 faces, 24 edges, 16 vertices and 48 parameter curves. The adjacent shell has genus zero with 12 faces, 28 edges, 18 vertices and 56 parameter curves. Exact original supports and the four inset planes are checked.
- **PASS, affected checks.** The 30 Kernel tests cover all ten new opening pairs in both orders on shifted rectangular stock. They check exact world rims, strict native incidence, independent slab occupancy and volume, typed refusals, native Save/Open and original native byte controls. A downstream Split of a lateral through shell yields 2,808 and 9,672 mm³. The 81 Model tests include the revision-pinned local Agent command and keep Rib selection in its existing scope. The 71 Studio tests, Kernel emit, all three type checks, scoped ESLint, driver syntax, diff checks and Studio production build pass on Node 22.19.0.
- **FAIL, corrected verification setup.** The first scoped ESLint command generated one nonexistent test path. The explicit existing paths pass.
- **NOT_RUN.** Broader freeform Shell, desktop Agent proposal approval for these new opening pairs, full local suites, mobile and live providers. The original #13 freeform and generalization acceptance stays open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run Studio flows and affected checks under the heavy gate.
BOX_OPENING_PAIRS_FROZEN=1 node apps/cad-studio/test/box-opening-pair-browser.mjs "$OUT/baseline" --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
BOX_OPENING_PAIRS_FROZEN=1 node apps/cad-studio/test/box-opening-pair-browser.mjs "$OUT/candidate"
node --test --test-concurrency=1 packages/barocss-cad/test/{part-opening-pair-shell-walls,part-tube-shell-walls,part-adjacent-shell-walls,part-shell-walls,prismatic-cap-identity,prismatic-solid}.test.mjs
pnpm --dir packages/barocss-cad-model test shell-walls shell-opening-history references toolset tool-contract rib
pnpm --dir apps/cad-studio test shell-opening-history opening-shell-failure parameter-height-finish toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
