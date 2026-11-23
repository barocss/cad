# D1833 — Export only visible STEP root bodies when requested

P2 row 13. [Issue #744](https://github.com/barocss/cad/issues/744). Base 00283ea1acdbbfe7048c372ee4157dde344b86a7.

Retained source and a fresh independent planar read of the base show both root solids in the default file. The baseline fixture has n1_b0 at 600 mm³ and centroid (5, 5, 3) mm, and hidden n3_b0 at 2000 mm³ and (35, 5, 10) mm. The base has no choice that removes the hidden root from the prepared geometry. The implemented choice is local to the STEP preparation. All root bodies remains the default whenever the panel is opened.

The Model writer filters hidden root outputs before STEP geometry admission. It uses the same inherited body look as the default report. It keeps visible placed occurrence behavior and sends actual included and excluded counts with the prepared text. The Worker receives the root choice with the current document and meshes choice. Studio retires prior preparations when the choice or accepted source changes. An empty visible scope and a reply with a mismatched scope do not produce bytes for the Export action.

- **PASS — independent files.** The fixed-timestamp default file matches its base bytes. The local Part 21 reader measures native closed planar shells and geometric moments rather than display meshes. Its selected file contains only n1_b0. Desktop Export passes the real generated STEP blobs and filenames to the browser file action. The driver suppresses that final anchor transfer and writes the observed bytes to its external evidence directory. This preserves the restriction on downloads.
- **PASS — actual Studio.** Default scope includes both roots. Visible scope includes only the visible root. Changing which root is hidden while a file is prepared clears the old panel. Preparing the same visible count after the change yields n3_b0 and its independent measured centroid. With all output hidden, Export is disabled. With one visible occurrence it writes only that placed box at (5, 30, 3) mm. A hidden faceted root changes neither the profile nor the visible-root file. Cancel and the local file action preserve the accepted model, selection and History.
- **PASS — focused tests.** 27 Model and 34 Studio tests, Model type check, Studio build and its type check, scoped lint, browser driver syntax and Git diff check. Both external mutations fail their intended tests when hidden roots are included or stale replies are accepted. Seven actual desktop checkpoints and five independently parsed blobs pass. All 1204 frozen inputs match after cleanup, with zero page, console or watched source errors.
- **FAIL — recovered fixtures and driver.** The first open-mesh fixtures are outside the existing Model mesh contract. The final facet fixture is a supported closed tetrahedron, and a separate hidden exact sheet proves that default refusal cannot block the visible file. The first browser driver addressed the label button when looking for visibility controls. The final driver uses the containing Browser row and frames the changed root before capturing the scene. Final runs pass.
- **NOT_RUN.** Operating-system download completion, external reader installation, mobile, full suites, STEP profile or tolerance widening, other export formats. First mechanical CAD remains 8/10 accepted. Overall CAD is unmeasured.

## Reproduction

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test step-export-scope step-report step-body step-name-loss
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test step-export-preparation step-metadata engine-client-lifecycle
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1833_SOURCE_FROZEN=1 node apps/cad-studio/test/step-visible-roots-browser.mjs "$OUT/studio"
```
