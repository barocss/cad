# D1683 — Freeze an editable B01 bracket revision for Agent evaluation

Issue [#322](https://github.com/barocss/cad/issues/322). Automation/B09, rows 04, 09, 12 and 16. Starting source `af8e105adff7ac5e0084280aec28dbff0d68e698`.

## Frozen case

- Case `b01-bracket-revision` starts from the retained D448/D538 W60 support bracket. The 3,431-byte fixture has SHA-256 `2727e7d3d726a58030657720ebc7a8d09a4dab574887dd7d2001cc42305ed16f`. Both Studio drivers and the evaluation brief use the same input. The original D538 operator override remains available.
- The human prompt SHA-256 is `6851258d2fb422efd2f336a3fb1436f54fb62a9d6016c51c0383f1e197f75bb9`. The prompt asks to move the right end from W60 to W80 and preserve the left anchor, depth, thickness, boss, through-hole, fillets, editable dimension and downstream references. It requests a preview for human approval.
- The controlled reference proposes the solved `olen0` edit and simulates the reviewer. This brief requests L1 if a provider is authorized later. The provider harness plays the reviewer between turns and records that acceptance separately from its tool calls. Studio approval below uses a real button click, and its decision is recorded as `user`.
- Explicit `validate --briefs` now refuses an unknown, duplicate or missing reference case. A tool refusal or zero hard checks fails the reference run.

## Evidence

The analytic volume is `400W - 160 + 1315π` mm³. The existing D538 Python oracle independently verifies the source graph, named edge, native topology, raw rational witnesses, bounds and actual fresh Studio worker result.

| State | Native bounds (mm) | Expected volume (mm³) | Original front-bottom edge |
| --- | --- | --- | --- |
| W60 and after the recovery edit | 60 × 40 × 25 | 27,971.19433947058 | 56 mm |
| W80 after approval and actual Save/Open | 80 × 40 × 25 | 35,971.19433947058 | 76 mm |

- **PASS, controlled local reference.** 5/5 hard checks. The original RB9 block-with-hole reference passes 5/5. The unknown brief exits 2.
- **PASS, negative controls.** Removing approval fails 4 of 5 hard checks. Changing the driving length to 79 mm fails 3 of 5. The generic `w:80` edit passes the same 5 checks on this bracket, so this case does not reproduce a generic-width geometry defect.
- **PASS, desktop Studio WebGPU.** L1 refuses direct edits and agent self-approval. The stale revision is refused. A successful dry run leaves the W60 file byte-for-byte intact. The proposal leaves the model at W60 before approval, and its Studio preview reports +8,000 mm³. Explicit Accept keeps the downstream references and yields W80. Native Save and a fresh browser context reproduce the accepted document and native geometry. Reopen the locked W80 sketch, edit it to W60 and Finish. The W60 native geometry hash matches the original. Five fresh D538 oracle bindings pass. Maximum measured native volume relative error is `4.05e-15`.
- **PASS, D538 desktop control and build.** The existing bracket replay passes nine fresh oracle bindings, including the public Measure command at 76 and 56 mm. Studio type check and production build, the standalone type check of the evaluation sources, syntax and diff checks, and scoped ESLint pass. ESLint retains the existing `no-explicit-any` warning in `codex.ts`. The corrected app-directory build supersedes an initial package filter that selected no project.
- **FAIL, initial browser harness attempts.** The first failed source-freeze checking because a checked-in fixture was specified by an absolute key. The next two reached W60 and failed on assumptions about how L1 reports drive-field discovery. The passing flow expects a direct L1 refusal and finds the current field through a nested dry-run diagnostic.
- **NOT_RUN.** Live provider, natural-language success rate, token cost, full local suites, and other rendering backends. The first CAD product baseline stays 8/10 and overall CAD coverage remains unmeasured.

## Follow-up

The current L1 discovery route for this case is a dry-run validation error that lists both generic width `w` and the locked length `olen0`. D1684 exposes the current editable dimensions and revision through a successful read-only Agent call and verifies the L1 approval path. The open #322 acceptance scope also includes broader tasks, multi-agent work and authorized provider measurement.

## Reproduction

Use Node 22.19.0. Use the workspace gate for one heavy run at a time. Write evidence to a fresh directory outside the repository. The desktop runs use the installed Chrome and Playwright.

```sh
node apps/cad-studio/scripts/ai-eval/ai-eval.mjs validate --briefs b01-bracket-revision,rb9-block-hole
node apps/cad-studio/scripts/ai-eval/ai-eval.mjs validate --briefs b01-bracket-typo
pnpm exec eslint apps/cad-studio/scripts/ai-eval/{bracket-revision,briefs,codex,main}.ts apps/cad-studio/test/{bracket-agent-revision-browser,bracket-baseline-browser,bracket-baseline-oracles}.mjs
pnpm --dir apps/cad-studio build
D1683_SOURCE_FROZEN=1 node apps/cad-studio/test/bracket-agent-revision-browser.mjs "$OUT/studio"
D538_SOURCE_FROZEN=1 node apps/cad-studio/test/bracket-baseline-browser.mjs "$OUT/legacy"
git diff --check
```
