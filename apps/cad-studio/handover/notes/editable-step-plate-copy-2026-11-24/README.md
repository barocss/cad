# D1841 — Save an editable copy of a STEP plate

P5 [row 31](../../roadmap-rows/31.md) and P2 [row 13](../../roadmap-rows/13.md), [#320](https://github.com/barocss/cad/issues/320). Base `ca29d49cb95c6498d65401ffdf252c8f04a18d78`.

**Save editable STEP copy** writes a separate BCAD file with a new rectangle Sketch, Extrude and Hole. The source document and STEP bytes stay in place. The command runs its geometry check on the existing Studio worker and checks document ownership before writing the file.

The first recipe accepts a single millimetre writer-profile STEP solid. Its rectangular stock starts at the origin and its one circular hole passes through both Z caps. The 96 KiB input limit and exact representation match keep the admission bounded. The comparison follows the submitted solid and context references before the STEP reader can pin curve endpoints or replace line carriers. Record IDs and descriptive names can vary. Coordinates, curve and surface coefficients, units, reference sharing and topology must match a native re-export. The imported B-rep must also pass the strict check as one genus-one solid.

- **PASS, original and copy.** Anonymous and renumbered geometry-only STEP opens in Chrome WebGPU. The actual copy download contains three new native features. The source document and file remain unchanged, SHA-256 `075389ef2e9d267b0a9b5465fc3a84caae4ff590cbb400b96186bae9bd2a815e`. An independent analytic oracle checks bounds, volume and centroid to `1e-8` in millimetre units. Native inspection also checks two inward cylindrical walls, vertical axes and both cap spans. The 40 × 30 × 10 mm source and copy both have volume 11717.256661177 mm³ with a Ø6 bore at (11, 9).
- **PASS, counterfactual edits.** Set the existing Extrude distance to 14 mm. The bore stays through at its original centre and diameter, and volume becomes 16404.159325648 mm³. Edit the same Hole to Ø8 at (14, 9). Stock bounds stay fixed and volume becomes 16096.283245596 mm³. A move outside the stock preserves the last good body and Undo/Redo. Native Save and fresh Open preserve the edited graph. A further 14 → 12 mm Extrude edit gives 13796.814210511 mm³ and keeps the moved bore through.
- **PASS, refusals.** The Studio action refuses both a plain plate and a file with an altered LINE carrier that ordinary Open still displays. No editable copy is downloaded and each source document is preserved. The focused tests also exercise a valid second fractional plate, a blind hole, two bores, multiple features, size limit, shadowed units, corrupted spline endpoints, missing references, duplicate records and a second DATA section.
- **PASS, affected validation.** Kernel fast build, 5 Kernel STEP tests, 16 Model tests and 61 Studio tests. Model types, Studio types and production build, scoped ESLint and Git diff check. The final Studio run captures 11 states. All 1,206 frozen files agree and page, console and source-change errors are zero.
- **FAIL, initial harness runs.** One Studio locator retained the closed page after fresh Open. A focused command launched the Studio test from the repository root and could not resolve a relative fixture. The final runs use the current page and Studio working directory.
- **NOT_RUN.** External STEP reader, alternate writer or units, other profiles, named drivers, Agent proposals, other GPU backends, mobile and full local suites. The feature graph is newly constructed. Original design intent, dimensions, material and manufacturing data remain unknown. #320 stays open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/step.test.mjs
node packages/barocss-cad-model/scripts/test.mjs editable-step-copy step-units step-empty-admission
pnpm --dir apps/cad-studio test step-export history-feature-editor work-ownership
D1841_SOURCE_FROZEN=1 node apps/cad-studio/test/editable-step-copy-browser.mjs "$OUT/studio"
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
