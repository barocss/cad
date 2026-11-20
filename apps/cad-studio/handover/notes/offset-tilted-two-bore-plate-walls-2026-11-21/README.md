# D1456 — Offset the four walls of a tilted two-bore plate

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `44d16d17e200b1381b5c61db2489b4fb76ba2a56`.

**Offset face** moves any cardinal exterior wall of the rectangular plate with two separate through bores after either cap tilts. The native reader binds both cylindrical pairs across the cap loops and checks the inward limit against both exact discs. The wall meets the same cap planes at its new endpoints. Both cylindrical pairs and their rim geometry stay. Model and saved History use one signed distance.

## Verification

- **FAIL, baseline.** Actual desktop Studio and stdio MCP refused all eight combinations of cap and wall. Revision pins `e609d7800f3754b7` and `8d1295abb99f25b8` preserved the original files and the 15107.084 mm³ part.
- **PASS, native kernel.** Both cap orientations and all four directions retain strict genus 2 with ten faces, fourteen loops, 48 coedges and pcurve IDs, 24 edges and sixteen vertices. The original cylinders and independently measured 6 mm and 4 mm diameters stay. Each exact nearest-bore contact refuses and a margin of 0.1 mm passes. The separate cap-contact cases pass at +19.9 mm, refuse +20 mm and keep their original solids. Both named bore-heal and diameter regressions pass.
- **PASS, actual desktop Studio and stdio MCP.** Eight new combinations complete a +5 mm handle drag and a −4 mm History edit. The exact nearest-bore contacts all refuse without replacing the accepted result. Undo, Redo, Save, fresh Open and Open of the matching MCP documents preserve the cap planes, both bores and the exact reference body. Flat two-bore and tilted one-bore controls pass. All ten desktop receipts record zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 123 Kernel, 62 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile and STEP. This decision covers at most two separate circular bores and one tilted cap on rectangular stock. #17 stays open.

Both cap orientations give the same volume. Integrate the affine thickness over the edited rectangle and subtract `156.9π` mm³ for the two bores.

| Wall | +5 and −4 mm volumes | Nearest contact |
| --- | --- | --- |
| X+ | `17887.5 − 156.9π`, `13824 − 156.9π` mm³ | X=29 mm at −11 mm, Ø4 |
| X− | `17212.5 − 156.9π`, `14256 − 156.9π` mm³ | X=8 mm at −8 mm, Ø6 |
| Y− | `17500 − 156.9π`, `13936 − 156.9π` mm³ | Y=6 mm at −6 mm, Ø6 |
| Y+ | `18900 − 156.9π`, `13104 − 156.9π` mm³ | Y=22 mm at −8 mm, Ø4 |

Use Node 22.19.0 and the existing Chrome and Playwright. Run the affected commands recorded in [D1454](../offset-tilted-one-bore-plate-right-wall-2026-11-21/README.md). Generate both tilted two-bore inputs with the [D1443 MCP fixture](../replace-two-bore-plate-cap-2026-11-21/README.md). Use the [flat two-bore D1453](../offset-flat-two-bore-plate-walls-2026-11-21/README.md) and tilted one-bore D1454 inputs as controls. Run heavy commands under the shared gate. Freeze worktree writes during desktop verification and keep evidence outside Git.

```sh
cd apps/cad-studio
for cap in upper lower; do
  for view in Right Left Front Back; do
    BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-$cap-$view" "$EVIDENCE/wire-two-$cap/mcp-replaced.bcad" "$view"
  done
done
BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-flat-two-control" "$EVIDENCE/two-bore-plate.bcad" Right
BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-tilted-one-control" "$EVIDENCE/wire-upper/mcp-replaced.bcad" Back
```
