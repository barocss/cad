# D1933 — Move geometry row composition into Model Browser

P4 [row 21](../../roadmap-rows/21.md) and [row 22](../../roadmap-rows/22.md), [#44](https://github.com/barocss/cad/issues/44). Base `362af38c7561d3f6087c029ed8c47e2428e8ec8e`. SMALL Studio refactor.

Model Browser now composes its body, sketch, placed-part, cut and Direct rows. It supplies the existing reveal registrations and row headings in the same order. App owns the existing selection, row state, editing and workspace transition callbacks. App moves from 2,494 to 2,488 lines.

- **PASS, desktop before and after.** All four body reveal checkpoints have the same document, selection, body state, history and notices. At 1024 and 1440 desktop widths the same row receives focus and scrolls into view, including when the Browser starts closed. The camera and model remain the same.
- **PASS, desktop before and after.** All three placed-part isolation checkpoints and nine functional observations match. The same opaque and faded part sets appear, and opening the next document resets isolation. Timing is outside this comparison.
- **PASS, affected control.** The six earlier-circular-cut Path checkpoints and all independent native results match D1931. Browser origin selection, Direct path binding, spacing, refusals and native Open run through the moved rows.
- **PASS, local checks.** Twelve focused Studio tests, scoped ESLint, Studio types and production build, and diff check.
- **FAIL.** None in these checks.
- **NOT_RUN.** Native WebGL2, broad Studio suite, performance remeasurement and mobile. The wider #44 stays open. First mechanical CAD remains 8/10 accepted. Whole-product completion is unmeasured.

```sh
BODY_BROWSER_REVEAL_FROZEN=1 node apps/cad-studio/test/body-browser-reveal-browser.mjs "$OUT/reveal"
ISOLATION_ADD_FROZEN=1 node apps/cad-studio/test/instance-isolation-add-browser.mjs "$OUT/isolation"
D1931_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/path" --quarter
pnpm --dir apps/cad-studio test body-browser-reveal add-to-isolation
pnpm build
git diff --check
```
