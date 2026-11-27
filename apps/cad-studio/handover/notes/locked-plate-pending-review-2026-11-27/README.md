# D2068 — Pin the locked-plate bore review before approval

P1 [row 04](../../roadmap-rows/04.md), [row 08](../../roadmap-rows/08.md) · [#754](https://github.com/barocss/cad/issues/754) · Base `6e739e02fc3817e9534f8cb50781e05470db3fe7`.

An open proposal over the locked mesh had no model review pin. The Agent could read the finished part after approval, but could not request the image and exact native walls of the pending candidate.

Admit the four-feature rectangle, Extrude and two-Hole recipe over one stationary locked mesh. Replay the specified proposal and verify the exact native plate, both exterior openings and the unchanged reference. The pending review shares `throughBorePlates` with the current native read. The image result lists the native wall names for inspection. The existing image pin ties the document, proposal, orientation, image and native body together. The separate `lockedPlateReference` identifies the unchanged reference. The locked mesh stays in its authored frame, separate from the native part.

The proposal hook owns preview invalidation and its asynchronous difference overlay. This reduces `App.tsx` from 2,445 to 2,443 lines.

## Verification

- **PASS, local MCP and desktop Studio.** The pending PNG and exact wall inspection identify the same Ø6 at (15, 20), Ø8 at (45, 20) and exterior openings at z = 0 and 5 mm. Before approval, the document retains zero editable bodies. Preview and Hide leave the document unchanged. Explicit Accept creates one native body. After Save and fresh Open the model revision, strict native B-rep digest, reference digest and through-bore evidence match the pending proof. Editing the left Hole to Ø10 preserves the other Hole and reference through Undo, Redo and another Save and fresh Open.
- **PASS, refusal controls.** A 0.01 mm edit of one locked mesh coordinate makes the former base pin stale. The current base pin still refuses the old proposal. Changing the proposal digest or image digest also refuses inspection. The 4.9 mm blind candidate fails native through verification before approval. The swapped candidate produces two actual through holes with different location-specific dimensions. The reads keep the input files byte-for-byte.
- **PASS, preview regressions.** At 1,024 and 1,440 px, a Box draft blocks Preview and Accept by mouse and keyboard. Cancel restores preview. Apply makes the proposal stale, Undo restores preview, and Redo restores the stale state. Studio retains 1,270 frozen source hashes in the plate flow and 686 in the Box flow. Both log zero page or console errors. The model tool and proposal checks pass 29/29. Studio tool and review checks pass 17/17. Scoped ESLint, both type checks, production build, browser-driver syntax and diff check pass.
- **FAIL, baseline.** The original pending proposal has no `modelReviewRevision` and pinned rendering refuses it with `MODEL_REVIEW_UNAVAILABLE`.
- **NOT_RUN.** Wrong centre, missing bore, wrong thickness, unknown reference scale, open mesh, equal-budget evaluation, live provider, full local suites and mobile. This read certifies a native shape and records its source reference. It supplies geometry for a later comparison against the authored target. #754 stays open. First mechanical CAD remains 8/10. Overall completion remains unmeasured.

The selected native body is `b3`. The pending and accepted model revision is `da57b0cb0cbadf1a`. The native SHA-256 is `a7e80eb9604d9caa6887a8c8f480becdc53d1f5ba987815161a34f9861294142`. The reference SHA-256 is `c21004b7f105b977f3ced4534151cded3a8895c232591004923e822357879590`. The pending PNG SHA-256 is `205febc97e6539d80fc162c161c86186609e61b6f66d9c5d23741dc0a78c90d4`.

```sh
# Node 22.19.0. Use the installed desktop Chrome and Playwright and acquire the heavy gate.
LOCKED_PLATE_BORE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/locked-plate-bore-browser.mjs "$OUT/final"
D1382_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/proposal-active-command-browser.mjs "$OUT/guard"
pnpm --dir packages/barocss-cad-model test toolset tool-contract proposals
pnpm --dir apps/cad-studio test proposal-review-availability toolset-mcp tool-contract-mcp
tsc --noEmit -p packages/barocss-cad-model
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
