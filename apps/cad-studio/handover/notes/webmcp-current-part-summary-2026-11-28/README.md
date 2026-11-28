# D2163 — Share the current part summary through WebMCP

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `7f94f0e99775be98e669ed9e09d821fd0598e3f7`.

The Chat panel can share one read-only browser tool, `cad_part_summary`, for the accepted ordinary base part. Sharing starts off. Explicit activation binds it to the current document and Open scope. It invokes the existing L1 `query.summary` and returns the Model revision, feature count, body keys, volume, bounds and face and edge counts in millimetres. The response omits file paths, node recipes and conversation data. The adapter exposes no file, edit, selection or proposal actions. It aborts registration on revocation, Open, ineligible Model state or Chat close and checks the current source before and after executing the read.

The implementation uses `document.modelContext` with registration lifetime signals and the browser's same-origin default. It follows the [November 24 community draft](https://webmachinelearning.github.io/webmcp/) and [Chrome local-development guidance](https://developer.chrome.com/docs/ai/webmcp). The isolated test enables the local browser feature. The app requires no origin-trial token or dependency.

## Verification

- **PASS, actual desktop Chrome 158.0.8127.89.** In an isolated localhost capability probe, the standard unflagged browser reports no API. The local flag exposes register, discover and execute, and abort retires the real tool. In Studio, both actual WebMCP discovery and native execution use one explicitly enabled tool. Its 40 × 30 × 10 mm result has 12,000 mm³, six faces, 12 edges and revision `644b252b57046a2c`. A separate stdio MCP call verifies the same projected summary and revision. The Studio Doc, selection and History are unchanged.
- **PASS, revocation and refusal.** Opening the 40 × 30 × 15 mm replacement retires the prior native tool handle even though the body key stays `b1`. Explicitly sharing again gives 18,000 mm³ at revision `e2a0f93ccbe0739a`. The old handle still refuses. An unknown argument yields a structured refusal. Turning sharing off and closing Chat retire the handles. Reopening Chat leaves sharing off. An actual unflagged Studio run hides the control and opens the original part normally. Final runs produce zero page errors, console errors and frozen-source changes.
- **PASS, affected checks.** 17 Model and 17 Studio tests, Studio TypeScript, scoped ESLint, driver syntax and production build.
- **Corrected first run.** Throwing on an extra input produced a browser console error. The final adapter returns a structured refusal with no document data. The final button uses the existing small Studio action component and the grant includes Open scope.
- **NOT_RUN.** WebMCP edits, provider use, cross-origin tools, an in-flight execution abort, deployed origin trial, mobile and full local suites. #204 remains open for later reviewed tool actions. The first mechanical CAD baseline is 8/10 accepted. Overall completion is unmeasured.

```sh
BROWSER_PART_SUMMARY_FROZEN=1 node apps/cad-studio/test/browser-part-summary.mjs "$OUT/revised"
BROWSER_PART_SUMMARY_FROZEN=1 node apps/cad-studio/test/browser-part-summary.mjs "$OUT/unsupported" --unsupported
pnpm --dir packages/barocss-cad-model test toolset tool-contract
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
