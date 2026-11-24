# D1886 — Pin the local Agent review of the inward tilted Sweep inlet

P5 [row 31](../../roadmap-rows/31.md) and [row 16](../../roadmap-rows/16.md), [#324](https://github.com/barocss/cad/issues/324). Base `91cb9cbec80ff89d1bea383b9c8834d0dcce323c`.

Add a revision-pinned local Agent image and inspection for the current named Replace face on the original five-span paired Sweep inlet. The inlet and outlet recognizers own separate terminal cap names and response keys. The same native candidate supplies both orientations and both inspection results. The document, proposal and orientation pins continue to use the existing review contract.

- **FAIL, unchanged local Agent.** The named command and Studio preview work, but the inlet proposal has no `modelReviewRevision`. A pinned render returns `MODEL_REVIEW_UNAVAILABLE`. Two actual desktop states verify that the proposal remains pending and previewable.
- **PASS, local Agent and actual Studio.** Eight desktop states each for inlet and outlet. The standard and opposite inlet images differ and use different review pins, with the same body `43f8c58e3ae617b23b95da1edad7993eead5c0f79d30555341c602fb64c27cb6`. Inspection identifies `n1.start`, the linked `n3.bottom` and the original cap ID. The opposed donor normal matches the same plane. Both passages, 48 joins and a 32 mm³ material reduction are reported. Changing the donor face in the same-base proposal, moving the donor in the model or using the wrong image orientation refuses stale inspection. The local Agent cannot approve the proposal. The current user approval in Studio, native Save and fresh Open preserve the same body digest. The outlet control keeps `pairedTiltedOutletReplacement` and its original digest.
- **PASS, affected checks.** 31 Model and 2 Studio tests, scoped lint, Model type checking and the Studio production build.
- **NOT_RUN.** Whole suites, live providers, wider proposal and geometry families, mobile and release. The original #324 research has wider acceptance. First mechanical CAD remains 8/10. Whole product completion remains unmeasured.

## Reproduce

Use Node 22.19.0 and the existing desktop Chrome and Playwright setup. Run heavy jobs serially and freeze the checkout during Studio.

```sh
pnpm --dir packages/barocss-cad-model test replace-face paired-elbow-outlet-offset-handle paired-elbow-outlet-plane-proposal-review
pnpm --dir apps/cad-studio test tool-contract-mcp proposal-browser
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1886_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-tilted-outlet-agent-browser.mjs "$OUT/inlet" --inlet
D1882_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-tilted-outlet-agent-browser.mjs "$OUT/outlet"
```
