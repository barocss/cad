# D1686 — Preview the solved Distance mate before approval

Issue [#322](https://github.com/barocss/cad/issues/322). Automation/Studio, rows 04, 09, 10 and 16. Starting source `2a1c0873df66887d274193ec2f564cb90e875f26` and the [D1685 pin mate fixture](../b05-pin-mate-agent-revision-2026-11-22/README.md).

D1685 reproduced a review gap. Studio could approve the existing Distance mate change, but the preview retained the pin at Z8 and reported that placement changes were outside its scope.

The proposal's existing solve now supplies the display worker with one translated top-level occurrence for a single saved Distance mate edit. The two mate references, occurrence identity and local part geometry must remain current. Other simultaneous pose changes, hidden placements and rotations keep the existing scope refusal. The proposal card shows the distance of the visible state. The worker still returns separate review meshes. The accepted document and picking continue to use the accepted model. Moving and exploded display modes are outside this static review qualification.

## Evidence

| Studio state | Displayed gap | Pin world bounds Z (mm) | Accepted pin Z (mm) |
| --- | ---: | --- | ---: |
| After before approval | 3 mm | 11–31 | 8 |
| Before / Hide | 0 mm | 8–28 | 8 |
| Accepted and fresh Open | 3 mm | 11–31 | 11 |
| Edit reopened mate to 0 | 0 mm | 8–28 | 8 |

- **PASS, desktop Studio WebGPU.** Ten captures, four shared native oracle bindings, no page errors, console errors or source writes. Front-view rays and physical pointer clicks reject selecting the candidate in After and select the actual pin in Before. The visible bounds match X28–36 and Y12–20 throughout. Review and toggles preserve the exact staged document and file bytes. Explicit Accept records the user decision, and native Save and fresh Open retain the two mating references and editable Distance. The same mate still solves at Z8 when edited back to zero.
- **PASS, eight focused checks and the B01 desktop control.** The unit control applies only the solved candidate pose. Unsupported move, reference-change, combined mate-option and rotation cases retain the old refusal. An ordinary placed shape edit still reports the volume change. Selection routing and the MCP contract tests pass. The separate B01 bracket still approves its W60→W80 proposal and retains editable width on native Open. Scoped lint, app TypeScript and production build, syntax and diff checks pass.
- **FAIL, first updated browser driver.** The driver treated projected canvas coordinates as client coordinates with the Chat dock open. The final run offsets them by the actual canvas position and proves both candidate and accepted clicks.
- **NOT_RUN.** Live provider, other display backends, moving and exploded view verification, and full local suites. The first mechanical baseline remains 8/10. Overall CAD and natural-language provider success stay unmeasured.

## Reproduction

Use Node 22.19.0, installed desktop Chrome and Playwright, the workspace gate, and a fresh evidence directory outside the repository.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test instance-evaluation scene-selection tool-contract-mcp
pnpm exec eslint apps/cad-studio/src/{App.tsx,state/useProposalPreview.ts,ui/ProposalBrowser.tsx,viewport/instanceEvaluation.ts} apps/cad-studio/test/{pin-mate-agent-revision-browser.mjs,instance-evaluation.test.ts}
D1686_SOURCE_FROZEN=1 node apps/cad-studio/test/pin-mate-agent-revision-browser.mjs "$OUT/studio"
D1683_SOURCE_FROZEN=1 node apps/cad-studio/test/bracket-agent-revision-browser.mjs "$OUT/bracket"
pnpm --dir apps/cad-studio build
git diff --check
```
