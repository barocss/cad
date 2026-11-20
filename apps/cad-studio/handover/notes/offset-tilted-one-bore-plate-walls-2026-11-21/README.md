# D1455 — Offset the remaining walls of a tilted one-bore plate

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `42065402016b879618927023508d3f17f32935bb`.

**Offset face** accepts all four cardinal walls on a rectangular plate with one circular through bore after either cap tilts. The same exact wall continuation handles X−, Y− and Y+. It intersects the moved support with the two original cap planes. The native candidate retains the fixed planar and cylindrical supports, exact bore trims and topology IDs.

## Verification

- **FAIL, baseline.** Actual desktop Studio and stdio MCP refused each of the three selected walls on both cap variants. The source files and accepted 15291.81 mm³ bodies stayed intact.
- **PASS, native kernel.** Both cap orientations and all four directions retain a strict genus-1 solid with eight faces, ten loops, 36 coedges and pcurve IDs, 18 edges and 12 vertices. Exact bore diameter is 6 mm. The near-bore 0.1 mm margin passes and exact contact refuses. An independent witness for each cap and direction allows +19.9 mm and refuses +20 mm at contact with the opposite cap. The source remains intact.
- **PASS, actual desktop Studio and stdio MCP.** Six new combinations completed the +5 mm handle drag and the −4 mm History edit. All exact bore contacts refused, with the accepted geometry retained. The separate reference, exact bore, original cap planes and native IDs agreed with MCP. Undo, Redo, Save, fresh Open and Open of the MCP file passed. The existing right wall passed as a control. All seven desktop receipts record zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 107 Kernel, 62 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile and STEP. Tilted plates with several bores remain outside this decision. #17 stays open.

The same analytic integral applies to either cap orientation. Integrate the affine thickness over the edited footprint and subtract the original bore volume.

| Wall | +5 mm station | −4 mm station | Exact bore contact | +5 and −4 mm volumes |
| --- | ---: | ---: | --- | --- |
| X− | X=−5 mm | X=4 mm | X=8 mm at −8 mm | `17212.5 − 98.1π`, `14256 − 98.1π` mm³ |
| Y− | Y=−5 mm | Y=4 mm | Y=6 mm at −6 mm | `17500 − 98.1π`, `13936 − 98.1π` mm³ |
| Y+ | Y=35 mm | Y=26 mm | Y=12 mm at −18 mm | `18900 − 98.1π`, `13104 − 98.1π` mm³ |

Use Node 22.19.0 and the existing Chrome and Playwright. Prepare both `mcp-replaced.bcad` inputs and run the affected tests and build commands as recorded in [D1454](../offset-tilted-one-bore-plate-right-wall-2026-11-21/README.md). Run heavy commands under the shared gate. Freeze worktree writes during desktop verification and keep evidence outside Git.

```sh
pnpm exec eslint packages/barocss-cad/src/features/bored-cap-offset.ts
cd apps/cad-studio
for cap in upper lower; do
  for view in Left Front Back; do
    BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-$cap-$view" "$EVIDENCE/wire-$cap/mcp-replaced.bcad" "$view"
  done
done
BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-right-control" "$EVIDENCE/wire-upper/mcp-replaced.bcad" Right
```
