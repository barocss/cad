# D1662 — Review a saved wall Offset after an inclined cap replacement

P5, row 31. [#322](https://github.com/barocss/cad/issues/322) and [#629](https://github.com/barocss/cad/issues/629). Base `807a2fdea4e5f239c39bb3e1e3f6e88d0bdb315a`.

Agent discovery and the existing `values.offsetDistance` edit accept a terminal signed wall Offset after one linked inclined upper-cap replacement of an Exact semicylinder. Admission requires the current part revision, one signed distance, both live solid owners and successful native replay of the edit and its link. The current History editor builds the proposal. Local autonomy L1 leaves it pending for explicit Studio approval.

- **FAIL, base.** The local L1 proposal with a valid current revision refused this feature as an unsupported wall profile. The scoped Model regression failed value discovery before the change. Both pass after the change.
- **PASS, affected checks.** 60 Model tests and 23 Studio tests, Model and Studio type checks, Studio production build, scoped ESLint, driver syntax and Git diff check. Model covers both physical skins, a missing donor, unrelated or nonterminal wall edits, missing and stale revisions, extra values, zero and no-op distances, wall contact, expected native geometry and current wall evidence.
- **PASS, actual desktop Studio WebGPU and local Agent.** The review render hashes agree with the emitted PNG data. The first +3 mm proposal on the original reference stays pending. In Studio, moving the donor down 2 mm makes that proposal stale. Preview is disabled, Accept is absent, and Rebase & preview refuses the old part revision. With the moved reference, local MCP refuses another request with the old revision and a fresh +12 mm candidate that would touch the fixed bottom. Neither refusal changes file bytes.
- **PASS, approval and fresh Open.** A new +3 mm proposal on the moved donor keeps the accepted R12/R8 mm solid during Preview. Studio shows +275.64 mm³ and applies the edit only on explicit approval. History records the user. The approved solid has R13/R8 mm, the original inclined plane link and a crown 4.5 mm above the bottom. The donor digest stays fixed. Volume is 1,252.6030907875652 mm³ and the native digest is `310b6c451ae6c159ed9bda91c5618383a80af9d0fdfb28249ce618b8683d2778`. Undo, Redo, Save and fresh Open reproduce the expected document and its editable +3 mm distance. The old proposal stays stale. MCP reads current 5 mm radial-wall evidence without changing saved bytes. Nine captures recorded 1,175 frozen files, zero source changes, and zero page or console errors.
- **NOT_RUN.** Full local suites, inner-wall approval in desktop Studio, WebGL2, mobile, exchange and paid live providers. The desktop run uses local stdio MCP and a synthetic native document. Both issues stay open for their wider scope.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`), and output directories outside Git. The input is the D1661 replace-first driver output `03-combined-doc.bcad`, before the donor moves.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test replace-face offset-face-native offset-exact-cylinder-wall offset-exact-cylinder-cap agent-offset-wall agent-axial-wall
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir packages/barocss-cad-model exec eslint src/chat/part/features.ts src/chat/toolDefinitions.ts test/replace-face.test.ts
pnpm exec eslint apps/cad-studio/test/linked-cap-wall-agent-proposal-browser.mjs
node --check apps/cad-studio/test/linked-cap-wall-agent-proposal-browser.mjs
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp batch-changes-mcp proposal
pnpm --dir apps/cad-studio build
D1662_SOURCE_FROZEN=1 node apps/cad-studio/test/linked-cap-wall-agent-proposal-browser.mjs "$OUT" "$D1661/03-combined-doc.bcad"
git diff --check
```
