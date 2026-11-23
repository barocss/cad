# D1818 — Distinguish STL precision refusal from unavailable tessellation

P2 exchange, rows 13 and 16. [Issue #279](https://github.com/barocss/cad/issues/279). Base `9306240cc49ccd3ee04f8433cda364115e28c25f`.

Check for a supported visible body that gives a genuine non-precision null from the existing Worker export function. Use the repository's 62 tracked native files under apps and packages outside handover, with the production file reader, ordinary display evaluation at quality 8 and `stlFor` at its default quality. Exclude hidden bodies, display meshes without export triangles and the distinct touching-piece split path. All 62 files open and display. Of 70 eligible root bodies, 69 return STL bytes and one throws the expected typed precision refusal. None returns null. These are corpus results at this source, not an exhaustive proof of Worker availability.

## Actual desktop Studio

Open the existing historical Round fixture with original SHA-256 `de9909089229a143d552ac12dbe0e88e4201b17fe266be35f3be752239b664b1`. Its visible body `b1` has volume 5571.116042280099 mm³. Export through the public dialog with each quality. Both source inspection and the actual Worker path agree on the error.

| Quality | Historical Round | Files produced |
| --- | --- | --- |
| Automatic | `STL_FLOAT32_COLLAPSE`, triangle 140 | 0 |
| Draft 8 | `STL_FLOAT32_COLLAPSE`, triangle 76 | 0 |
| Standard 16 | `STL_FLOAT32_COLLAPSE`, triangle 140 | 0 |
| Fine 32 | `STL_FLOAT32_COLLAPSE`, triangle 268 | 0 |

Open the ordinary Fillet fixture in the same Studio. Fine export produces one 7084-byte STL and a matching source sidecar. A direct binary reader finds 140 finite, nonzero-area triangles. All five operations retain each source document, body list, History and saved state. Six Chrome snapshots show zero worktree changes, page errors or console errors.

- **PASS.** Corpus evaluation, the four actual precision refusals, independent disk readback of the ordinary Fillet and Git diff check. No product code changes.
- **FAIL.** No unexpected execution failures. The four typed refusals are expected.
- **NOT_RUN.** Genuine non-precision Worker null from an eligible visible body. The retained mock covers fallback behavior only. Full local suites, local build, other backends and live providers were not run. Keep #279 open and defer that remaining probe until a supported fixture is available. No change to the Float32 guard or fallback rules.

## Reproduction

Use Node 22.19.0 and the heavy gate. List the tracked files with `git ls-files 'apps/*.bcad' 'packages/*.bcad'` and exclude handover. Bundle a local disposable probe with the installed Studio esbuild. For each file, call `readStudioFile`, then `evaluateDoc(doc, 1, 8, true)`. For each visible nonsplit root with `hasExportTriangles`, call `stlFor(doc, key)` and count bytes, typed refusals and null separately. In actual desktop Studio, open `historical-collapsed-round.bcad` and `fillet-drag.bcad` from the test fixtures. Use Export STL and the quality values above. Store all output outside the worktree. Neither external inputs nor substituted Worker returns are required.
