# D2170 — Measure two current planar faces through WebMCP

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `0b2248fb31f9c8cbddcec9f4ccb1ceb7a90ad067`.

The explicit Chat sharing control registers `cad_part_summary` and the new read-only `cad_part_measure_planes`. Pass the body key and revision returned by the summary plus two distinct cardinal face directions. Each direction must resolve to one original native planar face. The adapter uses the existing local L1 `query.measure` on that body. It returns the resolved face names, distance and normal distance in millimetres and angle in degrees. Missing and ambiguous faces refuse before measuring.

Both tools share the document and Open lifetime. Registration uses the same-origin default and a revocation signal. Each read checks the current document and execution signal before and after dispatch, following the [Chrome registration guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/webmcp/agentic-javascript-tools) and [WebMCP community draft](https://webmachinelearning.github.io/webmcp/). The browser run uses the existing local feature flags.

## Verification

- **PASS, actual desktop Chrome 158.0.8127.89.** `b1` at revision `644b252b57046a2c` returns 10 mm between its top and bottom, 0° and the exact `n1.top` and `n1.bottom` names. A real local stdio MCP read agrees. Top and right meet at 0 mm and 90° without a parallel distance. A fresh replacement has the same body key but revision `e2a0f93ccbe0739a`. Explicit sharing gives 15 mm. The old handle and old revision are refused.
- **PASS, actual scope controls.** Invalid arguments, duplicate directions and a missing body refuse. A cylinder has no unique left/right plane pair. One combined result containing two separated box occurrences has multiple top and bottom planes and refuses. Revocation and Chat close retire both handles. Reads preserve document, History and selection. A separate unflagged Chrome run hides the sharing control and opens the part. Final runs report zero page errors, console errors and changes across 703 frozen files.
- **PASS, affected checks.** 37 Model and 17 Studio tests, Studio types, scoped lint, production build, driver syntax and diff check.
- **NOT_RUN.** WebMCP edits, in-flight cancellation stress, external providers, deployment, full local suites and mobile. #204 stays open for its separate approval-based editing acceptance. The first mechanical CAD baseline remains 8/10. Overall CAD completion remains unmeasured.

```sh
BROWSER_PART_SUMMARY_FROZEN=1 node apps/cad-studio/test/browser-part-summary.mjs "$OUT/final"
BROWSER_PART_SUMMARY_FROZEN=1 node apps/cad-studio/test/browser-part-summary.mjs "$OUT/unsupported" --unsupported
pnpm --dir packages/barocss-cad-model test toolset tool-contract measure
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
