# D2094 — Keep a Shell opening on its original face through Split edits

P1/P5 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#4](https://github.com/barocss/cad/issues/4) · Base `5623645a40dc3c18d8d3bc29a7c92ba99065bafe`.

One original rectangular stock face can open a Shell on a named coordinate-plane Split output. The stored face name identifies the source feature and semantic face role. The existing Shell parent identifies the Split feature and signed output separately. Open verification and local Agent edits use the D2093 native receipt to verify the exact source image on that output. A lost image on the selected side causes an explicit refusal or a held feature. The Model also restores the authored face name when it reads an unconfirmed older substitution.

## Verification

- **PASS, baseline reproduction.** Actual Chrome Studio applies a 2 mm Shell from the original bottom of the positive X Split result. A raw saved file with the plane turned to Z=4 reused the transient face and body IDs on its generated lower cap. The baseline Open redirected the original Shell to that cap and marked the replacement. At L1 the baseline local Agent also staged that change. The real authored source, intended output and feature history distinguish the two roles.
- **PASS, actual desktop and local Agent.** At X=9 mm the native bottom opening gives 1,344 mm³ and centre (16.5, 8, 5.785714286) mm. Editing to X=12 retains the opening and gives 1,152 mm³ and centre (18, 8, 5.666666667) mm. These match independent outer and cavity calculations. The live Z=4 edit refuses and preserves the accepted document, which passes Undo, Redo, Save and fresh Open. The local Agent refuses the invalid proposal and preserves the accepted nodes. When the raw Z=4 file opens, Studio holds the Shell on its original role. Both native Split solids build and conserve 3,840 mm³. This run freezes 1,266 files without source changes, page errors or console errors.
- **PASS, independent cap-ambiguity regression.** The D791 Studio flow runs on the candidate. A native Split cap with a notch has two actual descendants with areas of 50 and 180 mm². The live edit refuses and preserves both accepted outputs. Cold Open holds the original Shell instead of choosing either descendant. The valid X=24 to X=26 edit and Save and Open pass. That run freezes 1,267 files without source changes, page errors or console errors.
- **PASS, affected checks.** 70 Model and 44 Studio tests, Model and Studio type checks, scoped ESLint, driver syntax, diff checks and Studio production build on Node 22.19.0.
- **FAIL, corrected candidate.** The first candidate held a valid reopening when it also required the display record's exact native ID. The final decision uses the actual native proof and verifies the exact name on the same output before retaining it. Both Chrome flows and the focused suite pass.
- **NOT_RUN.** General persistent naming, other new source families, full local suites, mobile and live providers. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run the Studio flows and affected build under the heavy gate.
SPLIT_ORIGINAL_FACE_REFERENCE_FROZEN=1 node apps/cad-studio/test/split-original-face-reference-browser.mjs "$OUT/baseline" --baseline
SPLIT_ORIGINAL_FACE_REFERENCE_FROZEN=1 node apps/cad-studio/test/split-original-face-reference-browser.mjs "$OUT/candidate-final"
D791_SOURCE_FROZEN=1 node apps/cad-studio/test/split-cap-ambiguity-browser.mjs "$OUT/ambiguity"
pnpm --dir packages/barocss-cad-model test references split-history-plane split-output-side toolset tool-contract
pnpm --dir apps/cad-studio test split-source-receipt project-open-ownership toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
