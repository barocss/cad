# D1507 — Propose uniform scaling of a revision-bound SubD cage selection

P5, row 08, [#322](https://github.com/barocss/cad/issues/322). Base `4df35541d18ea544e987daf86b906fa60f6ab55d`.

`subd.scale` accepts a current base-part feature index, `cageRevision` from `subd.select` or `subd.cage`, a positive finite factor and the selected vertex, edge or face indices. It uses Studio's existing selection centre and Model transform. The digest binds the stable feature ID, exact cage arrays and mirror plane. Placed-part reads do not issue a scale revision. Placed scale calls and non-integer feature indices refuse before lookup. A successful scale leaves topology and creases intact, preserves an existing mirror seam and reports no newly created selection elements. The normal Agent review gates apply.

## Verification

- **PASS, local MCP and actual desktop Studio.** At autonomy L1, direct scale and direct approval refuse. A mismatched cage revision and a placed-part scale also refuse. A request for top quad 90 at `[23.75, 32.5, 26]` mm proposes 1.1× scale as P1. Its preview preserves the source. Explicit Studio approval commits the one SubD edit and records the user decision.
- **PASS, independent coordinates and native read.** All selected positions match the analytic affine calculation, with observed error 0 mm and a 1e-10 mm limit. Unpicked coordinates, faces and creases remain exact. Native strict B-rep validation returns one solid, with volume changing from 9044.223951787639 to 9046.536210324644 mm³. The native and Studio Worker volume agree within 1e-6 mm³. The native digest is identical after fresh Open.
- **PASS, editable result and persistence.** Undo/Redo restore the pending and approved documents. Save and fresh Open retain the approval. The same Studio face accepts a manual inverse scale and returns to the original cage coordinates with observed error 0 mm while preserving the Agent decision. The manual edit survives another Save and fresh Open. The pending input file stays byte-identical.
- **PASS, affected checks.** 33 Model and 23 Studio tests, scoped lint with two existing warnings, Model types, Studio types/build, browser syntax, Git diff checks and regenerated agent tools documentation. The control passes and four mutations are caught: missing cage revision check, coercible index, identity scale and use of the world origin.
- **FAIL, intermediate checks.** Initial tool text measured 25,068 characters against the 25,000 limit. The final tool list and prompt total 24,916 characters. The exploratory legacy Studio chat suite reports stale handler enumeration; after a diagnostic update to that list it reaches an unrelated `offset-face` field mismatch. Root invocation also used the wrong fixture directory for three legacy cases. The scoped suite runs from the Studio app and passes. The legacy test file stays unchanged. An intermediate browser assertion expected a placed-argument error from a direct L1 write. The direct gate refused first. The final test sends that case through proposal validation.
- **NOT_RUN.** Paid/live Agent providers, other desktop renderers, mobile, full suites and additional actual cage families. #322 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Run heavy commands under the gate, freeze worktree writes during Studio and keep receipts and images outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs cageTools toolset tool-contract proposals
pnpm --dir apps/cad-studio test toolset-mcp cage-transform-draft proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{cageTools,contract,groups,toolDefinitions,tools}.ts packages/barocss-cad-model/test/cageTools.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
node "$EVIDENCE/mutation-check.mjs" "$PWD"
node --check apps/cad-studio/test/agent-subd-scale-browser.mjs
git diff --check
cd apps/cad-studio
AGENT_SUBD_SCALE_FROZEN=1 node test/agent-subd-scale-browser.mjs "$EVIDENCE/studio"
```

Two independent source reviews checked the local UI and MCP contract, authorization, current cage identity, native evaluation path and the analytic oracle. The authorization reviewer rechecked the base-only scope and integer admission after repair. The external mutation driver substitutes the relevant cageTools TypeScript source at bundle time and runs the existing scale test; it never changes the workspace source.
