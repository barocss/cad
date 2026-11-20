# D1444 — Verify both bore diameters after tilted cap replacement

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `d85e56f202931f15abbee398627a08be6c195c87`.

Studio Requirements and stdio MCP can verify each through-bore diameter on the D1443 plate after either cap is tilted. The reader proves the requested pair of inward walls, both trim rings and both axial seams. It binds the other bore to its own two walls between the same caps. Both bores clear each other and the rectangular stock. The cap planes have positive separation at each corner. Existing flat-bore, single-bore plate and circular tube checks stay available.

## Verification

- **FAIL, baseline.** Desktop Studio and stdio MCP read 6 mm and 4 mm in the unedited plate. After either cap is tilted, they still read cylinder radii 3 mm and 2 mm but mark both through-bore diameters unsupported. The reference body remains unknown.
- **PASS, native kernel.** Both original bore pairs keep cylindrical supports and exact diameter 6 mm and 4 mm on either tilt. Reversing a pair gives the same diameter. An incomplete pair, mixed pair, all four walls, or a missing twin in the other bore refuses to establish a diameter. The retained geometry, strict B-rep, 48 pcurve IDs and independent volume still pass.
- **PASS, actual desktop Studio and stdio MCP.** The flat, upper and lower files each pass both radii and both diameters. An intentional 6 mm expectation on the second bore fails with measured 4 mm. The reference body remains unknown. The Requirements panel and the MCP evidence agree at four pass, one fail and one unknown per file. Each file opens from its own bytes and keeps the source document. The single-bore rectangular plate, coaxial tube and eccentric tube controls still pass. Five desktop receipts record zero page errors, console errors and source changes.
- **PASS, affected checks.** 77 Kernel, 57 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and general multi-bore diameter admission. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/brep/cylindrical-bore.ts
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-two-bore-upper" two-bore-upper
node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-two-bore-lower" two-bore-lower
cd apps/cad-studio
D1439_SOURCE_FROZEN=1 node test/tilted-bore-requirement-browser.mjs "$EVIDENCE/studio-two" \
  "$EVIDENCE/wire-two-bore-upper/box-and-reference.bcad" \
  "$EVIDENCE/wire-two-bore-upper/mcp-replaced.bcad" "$EVIDENCE/wire-two-bore-lower/mcp-replaced.bcad" 3 2
```
