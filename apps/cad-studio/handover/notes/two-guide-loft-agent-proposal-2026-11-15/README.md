# D1276 — Propose a two-guide Loft through local MCP

2026-11-15 · FEATURE · P5, rows 07 and 16

`describe({feature:"loft"})` now describes the ordered `guides` pair and its placement rules. `features.add` accepts the same Loft recipe that Studio evaluates. The model checks that the request has two quadratic Bézier guides and two height sections, with no single guide or Smooth option enabled. The kernel checks the actual geometry. The existing proposal and approval policy applies.

- **PASS — local MCP.** At L1, discovery described the exact input. A direct add, one guide in the pair, a simultaneous single guide and pair, swapped guides, and an agent acceptance all received refusals. Rejected requests preserved the file bytes. The valid proposal added `P1` and reported `+819.84 mm³`. The accepted part still had two sketches and zero solids.
- **PASS — desktop Studio.** Opened the MCP-written file. Preview displayed the candidate and the `+819.84 mm³` change. Before and Hide restored the original empty part. Preview preserved the accepted document and file. A Studio user approved `P1`, with the proposal author and the user decision recorded in History. Undo restored the pending proposal, and Redo restored approval. Edited guide 2 middle X from 14 to 16 mm while preserving guide 1. Saved and reopened in a fresh desktop context. Reviewed four screenshots.
- **PASS — native and reopened readback.** Strict B-rep validated a closed solid with six faces. Both guide edges had two incident uses. Independent sections and volume agreed with the native and worker values. The approved part measured `819.8399999999998 mm³`. After editing, Studio measured `927.3599999999999 mm³` and local MCP reported `927.36 mm³`. The edited and reopened native inspection results were identical. Fresh MCP read the saved guide controls and approval state without changing the file.
- **PASS — regressions.** Model type check, lint, 36 Model tests and 7 Studio MCP tests. The D1275 manual Loft and D1272 agent Fillet desktop flows passed with the shared test helpers.
- **FAIL — existing documentation aggregate.** `IV001` reports 44 expected and 46 actual direct members in the checked API inventory. The generated refusal reference also differs from the sources. Neither mismatch begins in D1276.
- **NOT_RUN.** Full local suites, mobile, paid or natural-language model inference, other autonomy levels, extra rails, and other section geometry.

## Commands and evidence

Node 22.19.0. The gate serialized the checks. The Studio run checked 908 frozen files, with no unexpected page or console errors and no source writes. Receipt SHA-256 `b454ea8eaaa86242d0291b7a445640e1bd209a7862e4cee9aa138a2eb9bd5a64`. The saved file hash was `5e74dcf4d82fa374358bfebd4955d11d139048c5402bb0d685a8928f70277d71`. Edited and reopened inspection hash `21cb22d378c34e7fb9df755a01a9f1c040c1ec364c959ac97ebae876fa1a1ab4`.

```sh
D1276_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-agent-proposal-browser.mjs <external-evidence>
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test loft proposals
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-studio-app test toolset-mcp tool-contract-mcp batch-changes-mcp
D1275_SOURCE_FROZEN=1 node apps/cad-studio/test/loft-two-guides-browser.mjs <external-evidence>
D1272_SOURCE_FROZEN=1 node apps/cad-studio/test/drafted-fillet-agent-proposal-browser.mjs <external-evidence>
pnpm --filter @barocss/library-docs check:docs
git diff --check
```
