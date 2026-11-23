# D1845 — Review and save editable STEP copies through the local CLI

P5 [row 31](../../roadmap-rows/31.md), P2 [row 13](../../roadmap-rows/13.md) and [B09 local automation](../../roadmap-tracks/04-product-baseline.md), [#320](https://github.com/barocss/cad/issues/320). Base `6132cfe1c7f57a741759f7714ce41fed885e3f6d`.

The local CAD CLI uses the same certified plate and shaft recipes as Studio. The review prints the new feature graph, units, SHA-256 values and an ID bound to both the exact STEP bytes and the candidate BCAD bytes. A recognized plate can opt into named drivers. The review writes no file. Explicit Save rechecks both digests and publishes complete bytes at a fresh filename. An existing file is preserved, including one created before publication.

- **PASS, actual CLI.** Fresh CLI processes review and publish the same anonymous D1842 plate and D1843 shaft. The source digests stay unchanged. Both published BCAD digests match their reviews. Repeating each Save refuses the existing file. The named plate contains its three bound parameters. The shaft contains one native Shaft feature.
- **PASS, negative controls.** A different choice of named drivers or source bytes rejects the previous review. This includes a descriptive STEP name change that preserves the candidate geometry and digest. Unsupported geometry and bounds, a shaft with the named option, missing approval and remote paths are refused without creating a candidate file.
- **PASS, actual Studio.** Open both CLI files, edit the existing features, Save and open each result in a fresh context. Changing plate thickness from 10 to 13 mm retains the bore and gives 15232.433659530 mm³. Changing the second Shaft length from 8 to 10 mm gives 4900.884539600 mm³ with the same first stage. Independent volume and centroid checks use `1e-8` in millimetre units. Both original STEP and CLI BCAD files retain their exact bytes after Studio edits.
- **PASS, affected checks.** Eight Model and twelve Studio, CLI and MCP tests. Model types, Studio types and production build, scoped ESLint and Git diff check. Actual desktop Chrome WebGPU captures six states and freezes 1,209 files with zero page, console and source-change errors.
- **FAIL.** None observed.
- **NOT_RUN.** Alternate STEP representations or units, external reader, MCP or natural-language invocation of reconstruction, other rendering backends, mobile and full local suites. The command is available for controlled local automation. #320 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
node apps/cad-studio/scripts/cad-cli.mjs editable-step "$SOURCE_STEP" --named
node apps/cad-studio/scripts/cad-cli.mjs editable-step "$SOURCE_STEP" --named --review "$REVIEW_ID" -o "$NEW_BCAD"
D1845_SOURCE_FROZEN=1 node apps/cad-studio/test/editable-step-cli-browser.mjs "$OUT/studio" "$CLI_OUTPUTS"
node packages/barocss-cad-model/scripts/test.mjs editable-step-copy
pnpm --dir apps/cad-studio test editable-step-cli editable-step-preparation task-run-cli batch-changes-mcp
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
