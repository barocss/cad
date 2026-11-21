# D1514 — Accept bounded connected cage selection on open and mirrored parts

P5, row 08, [#626](https://github.com/barocss/cad/issues/626). Base `76a85ca1ded942f5e74e2882870987d60e05d12c`. Add a desktop regression for existing Model and Studio behavior.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| One-step Grow and Shrink in vertex, edge and face modes | [Connected selection](../cage-connected-selection-2026-11-17/README.md), exact adjacency tests and actual desktop selection. A whole component and isolated seed stay selected according to the existing rule. |
| Linked through topological connectivity | The same Model cases include spatially overlapping disconnected components and multiple seeds. Actual ordinary Linked covers 96, 95 and 48 cage faces on the closed, open and mirrored profiles respectively. |
| Linked inside explicit creases in Face mode | [D1511](../subd-linked-within-creases-2026-11-21/README.md) selects the 16-face closed upper region. D1514 checks exact open and mirrored regions and their native files. |
| Shortest path between two vertices | [Shortest cage path](../cage-shortest-path-2026-11-17/README.md) verifies minimum edge count, ascending vertex-ID ties, reversed picks, invalid and disconnected seeds, hole and pole fixtures, new topology and actual Studio editing and reopen. |
| Selection ownership and follow-up history | Exact Model IDs, current mode and source validation. Actual front/back picking, mode changes, selection-only Cancel, subsequent Crease and Move, cage Undo/Redo, Done, document Undo/Redo, Save and fresh Open. |

## Verification

- **PASS, actual open cage.** Delete one interior top quad in the creased box. The deleted selection clears. From a current seed, Linked within creases selects faces 80–94. Move +1 mm in Z changes exactly the 25 vertices of this region. Cage Undo restores the selection. Four cage boundary edges, 16 creases and all other coordinates remain exact. Native read confirms one open sheet with eight boundary edges and digest `d2d0b1ffca8ec8f2071d0f44a8a647b4636235e5fe7d1788851b05586c4bc815` after reopening.
- **PASS, actual X-mirrored cage.** Use the Studio Mirror action and select faces 40–47 of the stored 48-face half. The +1 mm Z move changes 15 region vertices. All eight half creases and 16 seam edges remain exact, and all seam vertices stay at X=0. The evaluated mirror reopens as one strict closed solid with digest `58c1bab6e87df1b52de8d8b7a5b1e3ccd9205971646887051de9db083196b383`.
- **PASS, focused controls.** 24 Model tests, actual front/back depth picking and Pick mode/Loop/Fill controls, browser syntax and Git diff checks. Both new actual workflows verify exact cage topology and independent positions, single edit history, native Save and fresh Open.
- **NOT_RUN.** Other crease and mirror profiles, length-weighted paths, mobile, alternate rendering backends and full local suites. Local types and build were not rerun for the browser-driver-only change.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work, freeze worktree writes during Studio and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs cage-connected-selection cage-shortest-path cage-selection-mode cage-boundary-loop cage-crease-noop
node --check apps/cad-studio/test/cage-connected-selection-browser.mjs
git diff --check
cd apps/cad-studio
CAGE_CONNECTED_SOURCE_FROZEN=1 node test/cage-connected-selection-browser.mjs "$EVIDENCE/open" --open-crease-fence
CAGE_CONNECTED_SOURCE_FROZEN=1 node test/cage-connected-selection-browser.mjs "$EVIDENCE/mirror" --mirror-crease-fence
D1321_SOURCE_FROZEN=1 node test/cage-depth-picking-browser.mjs "$EVIDENCE/depth-control"
D1324_SOURCE_FROZEN=1 node test/cage-selection-mode-browser.mjs "$EVIDENCE/mode-control"
```
