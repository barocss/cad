# D1893 — Pin the local Agent review of a second tilted Sweep cap

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#324](https://github.com/barocss/cad/issues/324). Base `e5aafc2ac31b6e0405ae25d45795280e278013a4`.

Add the local Agent's pinned preview and inspection for one proposed second tilted Replace face after the first opposite cap already belongs to the accepted model. Current source owner `n8/b8`, original Sweep `n1`, and candidate owner `n9/b9` carry separate identities. Both detached donors stay unchanged. The first cap's full native boundary digest must match across the proposal. Both image orientations and inspection use the same reviewed native candidate. The original single-cap response keys keep their existing shape.

- **FAIL, unchanged review path.** The same named second command dry-runs and Studio previews the pending proposal. The proposal has no model review pin and the local Agent's requested native image returns `MODEL_REVIEW_UNAVAILABLE`. The baseline expected-refusal test passes.
- **PASS, local Agent and actual Studio.** Eight desktop states for each two-cap order and eight for each single-cap control pass. The pending second tilt removes 32 mm³. Both two-cap orders approve the same strict native body `dfce16c20a4029b5445de68fc20467da181b2ba3e4e2f51eaf51d9da22f388c9`, with 2211.9644737231 mm³, two passages and 48 unchanged joins. Both local Agent orientations and inspection identify the same candidate digest, current source and second donor, with exact first-cap boundary equality. The first donor Move prevents approval and returns a stale-base refusal. A changed donor in the proposal and a mismatched image orientation also refuse. Studio explicit approval and native Save/fresh Open preserve the reviewed candidate. The original single-cap controls still return their established geometry keys and native results. An independent Sol High review confirms the separate original and current ownership.
- **PASS, scoped checks.** 31 Model tests, 2 Studio tests, Model type checking, focused lint and Studio production build.
- **FAIL, initial harness.** The inspector received JSON-encoded command-line arguments. The first run did not decode the fixture flag and stopped before creating the accepted first feature. The final baseline and changed runs decode the flags and execute the real local command.
- **NOT_RUN.** Whole local suites, model-provider calls, wider review shapes, mobile and release. #324 retains its wider research scope. First mechanical CAD remains 8/10 and whole product completion remains unmeasured.

## Reproduce

Use Node 22.19.0, existing desktop Chrome and Playwright. Run heavy jobs serially and freeze the checkout during Studio.

```sh
pnpm --dir packages/barocss-cad-model test replace-face paired-elbow-outlet-offset-handle paired-elbow-outlet-plane-proposal-review
pnpm --dir apps/cad-studio test tool-contract-mcp proposal-browser
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1893_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-tilted-outlet-agent-browser.mjs "$OUT/chained-outlet" --chain
D1893_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-tilted-outlet-agent-browser.mjs "$OUT/chained-inlet" --chain --inlet
D1886_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-tilted-outlet-agent-browser.mjs "$OUT/original-inlet" --inlet
D1882_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-tilted-outlet-agent-browser.mjs "$OUT/original-outlet"
```
