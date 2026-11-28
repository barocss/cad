# D2153 — Open three original box faces with independent Shell walls

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `1e607e6d7355b305c3efb5c2d220ef855c43a85a`.

Per-face Shell accepts three original box faces that share a corner. It exposes one thickness for each of the three opposite walls. The existing exact prismatic subtraction removes a single rectangular cavity. The document stores an explicit optional `thirdOpening` with the six signed original face records. Existing format versions and previous opening modes retain their original interpretation. The local Agent describes and executes the same command with exact native names, a current revision and all three kept thicknesses.

## Verification

- **PASS, desktop baseline and final.** The base shows no Per face option after original Top, Front and Right are picked. The final Studio previews three named kept walls, cancels to unchanged stock and applies on retry. On the 40 × 30 × 20 mm fixture, Left 3 mm, Back 4 mm and Bottom 2 mm give 6,684 mm³. The 20 mm floor is refused. Editing just the floor to 6 mm gives 10,532 mm³. Undo/Redo and native Save/fresh Open preserve the two volumes and exact History fields. The reopened native digest is `28692cec5c2fe9a740fdb70485f60fc807822681bd623e253ba2186925974ebe`.
- **PASS, local MCP to Studio.** `describe` reports the corner scope. A revision-pinned proposal removes 17,316 mm³. Default local MCP execution requires Studio approval and leaves the stock intact when accept is attempted there. Desktop Preview leaves the document unchanged. Studio Accept produces the same native digest as the manual 2 mm floor, `3591389c87c5e76b2361c40dafc34519a648c49e088a6c7e69c673a8b4842598`, with a user approval record. No provider ran.
- **PASS, native and independent checks.** Eight corners with six selection orders each match rectangular volume and centroid integrals. Area remains 5,200 mm² and bounds stay identical to stock. Each has one closed genus-zero shell, 11 faces, 25 edges, 16 vertices and all 50 pcurves. Original supports, inward offsets, rim trims and directed tessellation closure pass. A 0.0002 mm cavity passes on each axis. A 0.00005 mm cavity and wrong opening, ownership, missing wall and collapse are refused. The 22 existing closed, single and paired case B-rep digests match the base. The native oracle detects a deliberately halved wall offset in a scratch build.
- **PASS, affected checks.** 66 distinct Kernel, 15 Model and 49 Studio checks. Two independent geometry reviews, kernel build, Model and Studio types, scoped ESLint, browser syntax, whitespace and Studio production build pass. Actual Studio runs report no frozen-file changes, page errors or console errors.
- **Corrected test failure.** The first native check omitted the required density from `brepMassProperties`. The test now passes unit density. Production geometry and the numerical oracle are unchanged by this test correction.
- **NOT_RUN.** Opposite-face triples, four or more openings, general or fitted Shell, external CAD, mobile and full local suites. #13 stays open for its wider Shell acceptance. The first mechanical CAD baseline is 8/10 accepted. Overall completion is unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{part-corner-shell-walls,part-shell-walls,part-adjacent-shell-walls,part-tube-shell-walls,part-opening-pair-shell-walls,part-model}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs shell-walls attached-rib
node apps/cad-studio/scripts/test.mjs shell-opening opening-shell held-shell agent-tools
CORNER_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/corner-open-box-wall-shell-browser.mjs "$OUT/baseline" --baseline
CORNER_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/corner-open-box-wall-shell-browser.mjs "$OUT/final"
CORNER_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/corner-open-box-wall-shell-browser.mjs "$OUT/agent-final" --agent
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
