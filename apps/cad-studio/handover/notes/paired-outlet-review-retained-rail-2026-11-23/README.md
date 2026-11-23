# D1791 — Review the outlet Offset with its original Direct rail

P5 advanced modeling and reference accuracy, rows 16 and 31. [Issue #324](https://github.com/barocss/cad/issues/324). Base `ec1ff35db5d6ffd51e2dfaf1d73bce39f667ec64`.

Extend D1789 to the paired duct document that Studio creates with one retained visible Direct rail. The review binds both the current Direct workspace revision and the path copied into the Sweep. Its images depict the proposed native solid. Studio retains the authoring curve in the saved document.

- **PASS, original refusal reproduced.** On the retained-rail document, Studio shows the pending Preview. Local MCP returns `MODEL_REVIEW_UNAVAILABLE` with the input file byte-identical.
- **PASS, actual Studio and pinned Agent review.** Rail `rail` matches the authored copied path SHA-256 `159d875a59fca090b018b0362357e45d8be5a6bec5e7975029d1546b2cf86f9e` and the Direct inspection revision `85de3e5c78e743b1e6703e6be356f819a297404b3edd8d86235ad5a27a2e62ef`. Both render orientations and native inspection return these same pins. A signed −4 mm move gives y=30 mm and −128 mm³ with both passages and both tangent join groups intact. Studio Accept, Save and fresh Open keep the Direct rail data intact, restore its Studio Browser row, reproduce body SHA-256 `39ec778cbb535d30b295013d740ee15489f29a75320222b28417817028c727e3`, and return both original PNGs byte-for-byte. The image hashes match the standalone D1789 review.
- **PASS, stale and detached refusal.** Scaling the retained curve in a separate document changes its read pin while the model revision and copied Sweep path stay fixed. The old proposal pin returns `MODEL_REVIEW_PROPOSAL_STALE`. An independently staged signed Offset on that changed-rail copy cannot produce a pinned review because the curve and copied path differ. Both reads leave their input bytes unchanged. Neither copy is accepted.
- **PASS, controls and affected checks.** The standalone outlet review and the paired elbow creation review reproduce both prior image pairs. Four passing desktop runs record 27 snapshots with unchanged source capsules and no page or console errors. 44 Model tests, 17 Studio tests, changed-file ESLint, Model type check, Studio type check and production build, and Git diff check pass. The first type check required an explicit distinction between native evidence and the new refusal.
- **NOT_RUN.** Full local suites, aggregate lint rerun, documents with several Direct objects, other viewport backends, mobile and live providers. First mechanical CAD remains at 8/10 accepted. Overall completion remains unmeasured. Issue #324 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. `applied-native-doc.bcad` comes from the original application checkpoint of the following paired elbow control. On base Model sources, use `--expect-review-unavailable` with the retained rail.

```sh
D1787_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-sweep" --straight-tail --review
D1790_RETAINED_RAIL="$OUT/control-sweep/applied-native-doc.bcad" D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/retained-review" --review-outlet
D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control-no-rail" --review-outlet
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-evidence paired-line-arc-duct-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model exec eslint src/chat/{pairedElbowOutletProposalReview.ts,part/modelCandidate.ts}
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
