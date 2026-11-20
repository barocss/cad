# D1452 — Offset the other three walls of a rectangular through-bore plate

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `eb13ed9520817db154f232c1b889c26b9898d120`.

**Offset face** now uses the native outwards normal for all four vertical walls of a flat rectangular plate with one circular through bore. It updates the matching stock bound and the four cap-side bore pcurves. Both cylindrical bore walls, both exact cap planes and all surviving topology retain their original identities.

## Verification

- **FAIL, baseline.** Actual Studio and stdio MCP refused the X−, Y− and Y+ selections as outside the cap profile. MCP pin `9ca6e80eae3bd52e` kept the original 11717.257 mm³ summary and source bytes.
- **PASS, native kernel.** Each wall moves +5 mm outward and −4 mm inward. An exact reverse of either integer move restores the original B-rep. The selected wall's new station and the unchanged bore's exact 6 mm diameter are verified. All 36 pcurve IDs stay, with strict genus 1 and eight faces, ten loops, 36 coedges, eighteen edges and twelve vertices. A 0.1 mm wall-to-bore clearance stays valid. The contact distances in the table and larger inward moves refuse.
- **PASS, actual desktop Studio and stdio MCP.** For each new direction the native outward handle drags to +5 mm. History sets −4 mm and refuses exact contact without replacing the accepted model. Both applied documents match the MCP files. Independent volumes, centroids, fixed planes, diameter 6 mm, Undo, Redo, Save, fresh Open and exact MCP file Open pass. The right-wall and upper-cap controls pass. All six desktop receipts record zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 87 Kernel, 62 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP, tilted stock and stock with multiple bores. #17 remains open.

| Wall | +5 mm station | −4 mm station | Contact distance | Independent volumes |
| --- | ---: | ---: | ---: | --- |
| X− | X=−5 mm | X=4 mm | −8 mm | `13500 − 90π` and `10800 − 90π` mm³ |
| Y− | Y=−5 mm | Y=4 mm | −6 mm | `14000 − 90π` and `10400 − 90π` mm³ |
| Y+ | Y=35 mm | Y=26 mm | −18 mm | `14000 − 90π` and `10400 − 90π` mm³ |

Use Node 22.19.0 and the existing Chrome and Playwright. Reuse the D1451 `bored-plate.bcad` source. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and keep evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-bore-face replace-face revision-pinned-command toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/features/bored-cap-offset.ts packages/barocss-cad-model/src/app/profileCommands.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
for side in Left Front Back Right; do
  BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-$side" "$EVIDENCE/bored-plate.bcad" "$side"
done
BORE_CAP_OFFSET_FROZEN=1 node test/offset-bored-cap-browser.mjs "$EVIDENCE/studio-cap-control" "$EVIDENCE/bored-plate.bcad"
```
