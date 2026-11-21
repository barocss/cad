# D1512 — Discover a crease-bounded SubD region through local MCP

P5, row 08, [#322](https://github.com/barocss/cad/issues/322). Base `6d956096024526a28ab4225ee81a68d5330e853d`.

Read a current base cage face, take its `cageRevision`, and call `subd.select` with `what: "linked-within-creases"` and `seedFaces`. The action reuses Studio's face traversal across shared uncreased edges. It returns the complete region in face ID order and leaves the recipe unchanged. It refuses an old cage, a placed part, a held or suppressed feature, invalid seeds and a region above the requested limit. This stops an Agent from submitting a partial region as a complete selection. Use the returned revision and face IDs with the existing guarded proposal tools.

## Verification

- **PASS, actual local MCP.** Discover a single upper seed and obtain faces 80–95 within one 16-crease fence. A limit of 15 refuses and returns no face rows. An invalid seed refuses. The existing placed face query works without a base cage revision. The new read refuses the actual placed occurrence. Neither read changes its source file. L1 rejects direct scale and direct approval.
- **PASS, actual Studio and native file.** The user previews and accepts a 0.9× scale of the 16 selected faces. The independent position calculation matches within 2.23e-17 mm; the 73 vertices outside the region match exactly. Faces and all 16 creases remain exact. Strict native read and Studio agree on one solid. Native volume changes from 9222.111975893842 to 8956.356830393861 mm³. Undo, Redo, Save and fresh Open preserve the recipe and explicit approval. Native digest `12daf4332a349841f38b8679b759a1247fd74b138dff8eb17730ce2acdf2ac8e` matches on reopen. The original revision refuses after the change. A fresh read and manual Studio selection both recover the 16 face IDs.
- **PASS, affected and public contract checks.** 35 Model and 25 Studio tests, lint with four existing warnings, Model and Studio types, Studio build, generated tool table, browser syntax and Git diff checks. Prompt and tool list use 24,942 characters against the existing 25,000 cap. Mutations removing the revision check, crossing creases and dropping the whole-result limit are caught. Two independent source reviews completed. The actual manual crease-region and earlier single-face Agent scale controls pass.
- **FAIL, initial checks.** The first discovery assertion expected the previous tool hint. The updated check verifies the existing fields and the two new optional arguments. The first actual driver requested a nonexistent placed part and expected a different diagnostic. The final actual run supplies a real occurrence and verifies its scoped refusal. An initial TypeScript check widened a synthetic suppressed flag from literal `true` to `boolean`; the final check uses the exact literal.
- **NOT_RUN.** Live model providers, other cage families and backends, mobile and full local suites. #322 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work, freeze worktree writes during Studio and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs cageTools toolset tool-contract proposals
node "$EVIDENCE/mutants.mjs" "$PWD" "$EVIDENCE"
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp cage-transform-draft proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{cageTools,groups,toolDefinitions}.ts packages/barocss-cad-model/test/{cageTools,toolset}.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/cage-connected-selection-browser.mjs
git diff --check
cd apps/cad-studio
CAGE_CONNECTED_SOURCE_FROZEN=1 node test/cage-connected-selection-browser.mjs "$EVIDENCE/agent" --agent-crease-fence
CAGE_CONNECTED_SOURCE_FROZEN=1 node test/cage-connected-selection-browser.mjs "$EVIDENCE/manual-control" --crease-fence
AGENT_SUBD_SCALE_FROZEN=1 node test/agent-subd-scale-browser.mjs "$EVIDENCE/scale-control"
```
