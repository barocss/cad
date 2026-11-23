# D1784 — Extract the in-place assembly edit status bar

P4 Studio code structure, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `9ee000cf10e1aea4b59612d337e8f0ed4bb87981`.

Move the in-place edit status bar into `InPlaceEditStatus`. App passes the existing transaction actions and the existing focus capture. The status text, Details, buttons, action order and DOM classes are retained. `App.tsx` goes from 3,046 to 3,036 lines.

- **PASS, actual desktop Studio WebGPU.** Open the two-occurrence assembly and edit Cube 2 in place. Check the shared count and Details. Set the extrusion width to 30 mm. Cmd+S refuses without downloading a file. Finish publishes revision B to both occurrences in one history step. Undo and Redo restore the expected assembly. Change a second draft to 45 mm. Cancel opens the choice. Keep editing preserves the draft. A second Cancel and Discard restore the 30 mm assembly. Save and fresh Open retain the two occurrences, their placements and the base.
- **PASS, before and after comparison.** Ten paired desktop states, two observations, two independent Python oracle inputs and results, and the saved file match exactly. Saved assembly SHA-256 is `0f731697953acb1e477b8b02b15faa2ddf43f8132afcd04f98ef866baece6685`. Both final runs report zero source changes, page errors or console errors.
- **PASS, affected checks.** 20 Studio tests, scoped ESLint, Studio type check and production build, and Git diff check.
- **FAIL, inherited overlap.** The first baseline run confirmed the save refusal. With in-place Details expanded, the banner covers the notice's Dismiss button and the general dismissal helper times out. The behavior-preserving verification continues through Finish with the notice present. D1785 records the bounded overlap fix separately.
- **NOT_RUN.** Full local suites, alternate viewport backends, single-instance variation, mobile and live providers. First mechanical CAD remains 8/10 accepted. Overall completion remains unmeasured. Issue #44 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. For the paired comparison, run the same driver with and without the extracted status view in the source tree.

```sh
EDIT_IN_PLACE_SOURCE_FROZEN=1 node apps/cad-studio/test/edit-in-place-browser.mjs "$OUT/base"
EDIT_IN_PLACE_SOURCE_FROZEN=1 node apps/cad-studio/test/edit-in-place-browser.mjs "$OUT/candidate" --extracted-status
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test edit-in-place editor-return-focus proposal-history-focus project-recovery-warning
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/ui/InPlaceEditStatus.tsx apps/cad-studio/test/edit-in-place-browser.mjs
pnpm --dir apps/cad-studio build
git diff --check
```
