# D1619 — Heal two through bores in one Delete face action

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base `eb3cd7350a2ac61540fea295094bf3e5fedf2f4b`.

Select both distinct walls of a supported flat plate with two through bores. Delete face builds two existing single-face nodes and applies the complete document in one action. Each node owns its original native signature. The second node consumes the first node's output. The original Hole nodes remain editable. Studio and the local Agent use the same command.

- **PASS, desktop Studio WebGPU.** Pick the Ø6 and Ø4 walls in the viewport. One Apply heals both, one Undo restores both, and one Redo heals both again. Native Save and fresh Open keep the healed part. Opening a saved variant with a changed second signature is refused and the accepted Studio document remains identical.
- **PASS, native and local MCP.** The independent 40 × 30 × 10 mm prism has volume 12,000 mm³ and centroid (20, 15, 5) mm. The healed result matches with six faces, six loops, 24 coedges, twelve edges, eight vertices, genus zero and zero edge-to-surface gap. Outer topology IDs and retained records match. The local server uses review revision `31f8e9a486b02790` and writes the same document as Studio. It refuses duplicate named picks and a repeated command at the old revision.
- **PASS, focused controls.** Both valid pick orders use the same two original signatures. Mixed, duplicate, aliased and cross-body selections refuse. A modified second signature rejects the full candidate in Model and preserves the initial two-bore state. Existing single-face command callers remain verified.
- **PASS, affected checks.** Ten Kernel, 30 Model and 25 Studio tests, Model and Studio types, scoped lint, tool-table check, Studio production build, driver syntax and Git diff. The actual run checks 1,159 frozen files with zero page errors, console errors and file changes.
- **FAIL, baseline and corrected checks.** The base Studio command and MCP handler only accepted one selected face. Correct an expected signature in the test to use the current rounding rule, and type the test's selection context. Regenerate the Agent tool table to include D1615's existing inspect discovery hint.
- **NOT_RUN.** A second actual Studio pick order, arbitrary surfaces, tilted plates, other renderers, exchange, mobile and full local suites. #17 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Acquire the heavy gate and keep screenshots and evidence outside Git.

```sh
node --test packages/barocss-cad/test/bored-face-delete.test.mjs
pnpm --dir packages/barocss-cad-model test delete-bore-face revision-pinned-command toolset tool-contract
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/{app/deleteFaceCommand.ts,chat/part/features.ts} packages/barocss-cad-model/test/delete-bore-face.test.ts apps/cad-studio/test/delete-bore-face-browser.mjs
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --dir apps/cad-studio test document-file command-apply toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/delete-bore-face-browser.mjs
DELETE_BORE_FACE_FROZEN=1 node apps/cad-studio/test/delete-bore-face-browser.mjs "$EVIDENCE" first atomic
git diff --check
```
