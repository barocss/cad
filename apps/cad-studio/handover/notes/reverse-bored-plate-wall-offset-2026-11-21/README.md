# D1457 — Verify that an inverse wall offset restores the source

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `8992e4c4b59178c67de1edd7a2d8c07395ee08cd`.

The named move-and-reverse acceptance passes for the tested outer walls of rectangular through-hole plates. The first move and its inverse are separate Offset face features.

## Verification

- **PASS, seeded native matrix.** Seed `0x1457a11` supplies 16 flat cases across all four walls, one or two circular bores, and positive or negative initial distances. The signed first move and its inverse preserve face count and names. All 16 inverses reproduce the original native B-rep. Independent analytic volumes agree within `1e-7` mm³. All 32 volume comparisons pass the estimated bound from the code-independent ray oracle at `128 × 128` with eight shifts. The largest fraction of that bound is 0.806.
- **PASS, actual desktop Studio and stdio MCP.** The tilted upper/X+, tilted lower/Y+ and flat one-bore/X− witnesses accept +5 mm with the drag handle and −5 mm as a new Offset face. Each History editor retains its own value. One Undo returns to the wider intermediate part and one Redo restores the inverse. Studio Save, fresh Open and fresh Open of the MCP document preserve the restored volume, original supports, bore dimensions and existing topology IDs. The flat witness returns to its original native B-rep. The +5/−4 mm History control also passes. All four receipts record zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 94 Kernel tests including the new seeded matrix, browser driver syntax and the Git whitespace check.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and randomly generated tilted plates. #17 stays open.

Use Node 22.19.0 and the existing Chrome and Playwright. Generate the two inputs from [D1456](../offset-tilted-two-bore-plate-walls-2026-11-21/README.md) and the flat one-bore input from [D1451](../offset-bored-plate-right-wall-2026-11-21/README.md). Run heavy commands under the shared gate. Freeze worktree writes during desktop verification and keep evidence outside Git.

```sh
node --check apps/cad-studio/test/offset-bored-wall-browser.mjs
node --test packages/barocss-cad/test/{bored-wall-reverse,bored-cap-offset,box-wall-replacement,prism-wall-offset}.test.mjs
cd apps/cad-studio
BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-upper-reverse" "$EVIDENCE/wire-two-upper/mcp-replaced.bcad" Right reverse
BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-lower-reverse" "$EVIDENCE/wire-two-lower/mcp-replaced.bcad" Back reverse
BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-flat-reverse" "$EVIDENCE/bored-plate.bcad" Left reverse
BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-history-control" "$EVIDENCE/wire-two-upper/mcp-replaced.bcad" Front
```
