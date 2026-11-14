# D1278 — Author a two-guide Loft from the Model TypeScript API

2026-11-15 · FEATURE · P5, rows 04 and 07

`StudioPart.loft(sections, { guides })` now passes the ordered pair through the same Model admission and native evaluation as local MCP and desktop Studio. The public facade exports `StudioLoftOptions` and `StudioLoftSection`. The guide controls are copied in world mm. The qualified profile uses two congruent, axis-aligned rectangles on a common XY sketch plane and two quadratic Bézier guides.

- **PASS — public API and codec.** Built the rectangular profile using the public entry point. Changing the caller's second guide array left the accepted part unchanged. A new build with that change measured 927.36 mm³. Conflicting guide inputs and swapped corners were refused. The accepted part and the original part remained unchanged. Native file encoding and decoding preserved the guide recipe and the analytic volume and centroid.
- **PASS — desktop Studio.** Opened a native `.bcad` produced by that API. Both rails and native side samples matched the API result. Changed the first guide middle X from 2 to 3 mm while preserving the second guide. Undo and Redo restored both documents. Save and fresh Open reproduced the edited native inspection. Studio volumes were 819.8399999999998 and 768.9599999999998 mm³ against independent values of 819.84 and 768.96 mm³. Strict B-rep, four side patches, and both two-use guide edges passed. Reviewed three screenshots.
- **PASS — regressions.** Model type check, 24 focused Loft tests, lint, Studio production build, and the D1275 manual desktop run with the shared native inspector.
- **FAIL.** No failure in the checks above. The existing documentation aggregate failure remains recorded in D1276.
- **NOT_RUN.** Full local suites, mobile, paid inference, a new standalone Kernel facade verb, and other section or guide geometry.

## Commands and evidence

Node 22.19.0. The gate serialized the runs. The desktop run checked 1,134 frozen files. No page errors, console errors, or source writes. Receipt SHA-256 `09a58444128058db9fe433ba238163814e319b90b2942f31ec755f4ab2f84f75`. Saved `.bcad` hash `7b52bf16775d46baded3397ecafc49786d7e72f45b139bd75209ef5148871582`. Edited and reopened native inspection hash `377e3faf22762472cff3c148058986a52d76b6888fd5aa611e59792d2931df6f`.

```sh
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test loft
pnpm --filter @barocss/cad-studio-app build --outDir <external-evidence>
D1278_SOURCE_FROZEN=1 node apps/cad-studio/test/api-two-guide-loft-browser.mjs <external-evidence>
D1275_SOURCE_FROZEN=1 node apps/cad-studio/test/loft-two-guides-browser.mjs <external-evidence>
git diff --check
```
