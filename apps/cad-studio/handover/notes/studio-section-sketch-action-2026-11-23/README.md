# D1754 — Extract the Studio section-to-sketch action

P4 Studio structure, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `69ff99e7506cd0de594cd778a412edbd96ef714e`.

Move the exact section copy's admission, notice, draft and camera framing into the existing section sketch module. It captures the rendered Open intent and reads the live section state for the action. App supplies the current model, project and view actions. App.tsx goes from 3,132 to 3,121 lines.

- **PASS, desktop Studio WebGPU before and after.** Four runs match 37 paired states, 13 measured observations and 27 native file or inspector records byte for byte. Copy only the visible solid's section, then restore the hidden solid. Copy All, Outer only and Inner only from 40 × 30 × 10 mm stock with zero, one and two holes across eight cases. Verify Cancel, Undo, Redo, Save and fresh Open. The copied R3 inner outline extrudes 2 mm to 56.54866776461628 mm³ after Open.
- **PASS, refusal and ownership.** Inner only refuses a section with zero holes. A controlled late exact Worker reply leaves the source and History intact and the next section current. A controlled malformed reply masks a known native rim with 30 triangles. All three copy modes refuse it and preserve the document, section and History. All runs have zero source, page or console errors.
- **PASS, affected checks.** 13 Studio tests, scoped ESLint, Studio TypeScript and production build, and Git diff check.
- **FAIL.** None.
- **NOT_RUN.** Full local suites, alternate GPU backends, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion is unmeasured. Issue #44 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and separate external evidence directories for the base and candidate.

```sh
D1011_SOURCE_FROZEN=1 node apps/cad-studio/test/section-visible-copy-browser.mjs "$OUT/visible"
SECTION_CONTOUR_COPY_SOURCE_FROZEN=1 node apps/cad-studio/test/section-contour-copy-browser.mjs "$OUT/contour"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test section-sketch-copy section-exclusion-session section-selective-core section-view
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/app/sectionSketch.ts
pnpm --dir apps/cad-studio build
git diff --check
```
