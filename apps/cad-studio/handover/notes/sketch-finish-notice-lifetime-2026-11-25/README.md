# D1966 — Retire an obsolete Sketch Finish refusal

P1 [row 12](../../roadmap-rows/12.md) and [row 16](../../roadmap-rows/16.md). [#44](https://github.com/barocss/cad/issues/44). Base `620f7450fc97fee902d35852ead932ddc53ff058`. Small Studio correctness change.

A Sketch Finish refusal carries the exact document and sketch generation. Studio keeps the message for the same failed draft. Correcting the draft or leaving it retires the message through the existing notice ownership check.

- **FAIL, previous Studio.** The D1964 native rectangle-to-disk receipt shows a successful 4 mm Finish with the preceding tangent-width refusal still visible.
- **PASS, actual desktop Studio.** A tangent 6 mm Finish still refuses and keeps the accepted part. Keep editing retains that current refusal. Discard changes clears it while keeping the same accepted document. Reopen and repeat the invalid change, then enter a valid width. The old message clears before Finish and the corrected Finish applies.
- **PASS, native geometry and controls.** Seven inspection records match D1964 byte for byte. The corrected body has native volume 224 mm³ at centroid (12,16,13) mm. Existing delayed refusal and Sketch exit controls pass, including a current Hole refusal, cancellation, supersession and valid retry with fresh Open.
- **PASS, affected checks.** 39 Studio checks, Studio types, production build, scoped lint and diff check.
- **FAIL, corrected driver invocation.** The first Sketch exit control omitted its required current-build mode. The rerun passes with `--fixed`.
- **NOT_RUN.** Other notice classes, full local suites and mobile. #44 remains open. First mechanical CAD is 8/10. Overall CAD remains unmeasured.

```sh
D1966_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/studio" --rectangle-disk --finish-notice
D735_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-finish-ownership-browser.mjs "$OUT/refusal-control" --expect=refusal
D663_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-mode-exit-browser.mjs "$OUT/exit-final" --fixed
node apps/cad-studio/scripts/test.mjs draft-sketch-history drawing-notice-lifecycle parameter-height-finish
pnpm build
git diff --check
```
