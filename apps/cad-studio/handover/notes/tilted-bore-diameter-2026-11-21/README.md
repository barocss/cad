# D1439 — Verify a through-bore diameter after a tilted cap replacement

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `6b409a716067f9b50949f1a5fa651f0d3c104b28`.

The existing native bore check keeps its original circular-rim path. A second path admits the strict rectangular plate with one flat and one tilted rim. It authenticates both inward cylinder halves, their two axial seams and both complete inner cap loops. The tilted rim poles lie on the actual cap plane. Their projection normal to the cylinder axis is a complete exact rational circle on the same radius. The four outer supports clear the bore, and the minimum axial gap over the whole disk is positive. The cap loops have opposite winding. Strict B-rep validation is required before the diameter is available.

## Verification

- **FAIL, baseline.** The real desktop Studio Requirements panel and stdio MCP gave two passes on the flat stock (radius 3 mm and diameter 6 mm). Both tilted fixtures retained radius 3 mm and returned an unknown bore diameter. Source bytes and the open model stayed.
- **PASS, native kernel.** The two independently qualified tilted-cap results give diameter 6 mm in both member orders. A single half, duplicate or foreign members and an altered rim pcurve refuse. The original bored-cap Offset, bore healing, hole, box and prism replacement tests pass.
- **PASS, actual desktop Studio and stdio MCP.** The flat, upper-tilted and lower-tilted documents each pass the radius 3 mm and diameter 6 mm checks. The explicit 8 mm check fails with measured 6 mm, and the same face requested on the separate reference is unknown. MCP check and evidence agree with the Studio Requirements panel. Both the opened document and all input file bytes stay.
- **PASS, affected checks.** 50 Kernel, 74 Model and 27 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table. The final Chrome receipt reports zero page errors, console errors and source changes.
- **Test harness.** An initial attempt through the Chat UI timed out before a response. The actual Requirements panel reproduced and verified the product behavior directly. An early panel assertion expected a shorter label for the deliberately wrong diameter. The final check reads the measured number and accommodates the displayed tolerance suffix.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export and Fit workflows. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{bored-cap-offset,bored-face-delete,d148-hole-face,box-wall-replacement,prism-wall-offset}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs spec task-plan task-execution replace-face toolset tool-contract
node apps/cad-studio/scripts/test.mjs document-file task-run-handoff toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in bored-upper bored-lower; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
D1439_SOURCE_FROZEN=1 node test/tilted-bore-requirement-browser.mjs "$EVIDENCE/studio-diameter" \
  "$EVIDENCE/wire-bored-upper/box-and-reference.bcad" \
  "$EVIDENCE/wire-bored-upper/mcp-replaced.bcad" "$EVIDENCE/wire-bored-lower/mcp-replaced.bcad"
```
