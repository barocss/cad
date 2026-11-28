# D2140 — Give native part insertion its own Studio controller

P4 [row 20](../../roadmap-rows/20.md) and P3 [row 10](../../roadmap-rows/10.md) · Base `fcdc6f02991fe59477dc87400bf05017d1d61a77`.

The insertion controller owns decoding, admission, source linking, placement and the insertion notice. App continues to supply the existing document commit, selection and viewport callbacks. App.tsx goes from 2,359 to 2,342 lines. After a successful retry the controller retires the exact prior insertion failure. A newer notice belongs to its original action.

## Verification

- **PASS, baseline and candidate.** Chrome Desktop refuses a malformed part file and preserves the base document and history. The accepted fixture appears as `inst1` at X60 mm using the original file name and source. The native 40 × 30 × 20 mm base and 10 × 8 × 6 mm inserted stock measure 24,000 and 480 mm³. Undo removes the occurrence. Redo and native Save/fresh Open restore it. The before and after saved file bytes match, SHA-256 `9fe023a720d5833d01ae780c5742c9b60f74078488f3ab170e5fa5d23c423718`.
- **PASS, notice ownership.** The baseline and initial extraction both retain the obsolete error after the next successful insertion. The final candidate clears it. A separate failed Open then replaces an insertion error, and the next successful insertion preserves that newer Open notice.
- **PASS, affected checks.** 44 Studio tests, Studio types, scoped lint, driver syntax, diff check and production build pass on Node 22.19.0. The baseline and final desktop flows freeze 1,278 and 1,279 files respectively with zero source changes, page errors or console errors.
- **FAIL, corrected lint.** The initial extraction left the unused `refusal` import in App. The final changed-source lint passes.
- **NOT_RUN.** Direct insertion of a linked project file, full local suites and mobile. No open issue is closed by this refactor. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run each desktop flow under the heavy gate.
PART_FILE_INSERTION_FROZEN=1 node apps/cad-studio/test/part-file-insertion-browser.mjs "$OUT/baseline" --baseline
PART_FILE_INSERTION_FROZEN=1 node apps/cad-studio/test/part-file-insertion-browser.mjs "$OUT/final"
pnpm --dir apps/cad-studio test studio-assembly-changes instance-source project-open-ownership direct-curve-candidate
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/final-dist"
```
