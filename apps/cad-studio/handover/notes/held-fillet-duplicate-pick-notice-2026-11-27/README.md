# D2050 — Retire a duplicate-edge notice after a valid Fillet pick

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md). [#20](https://github.com/barocss/cad/issues/20). Public base `472550134d6d22c0f251a10625b911f0828c1140`.

When both held Fillet slots have valid picks, a duplicate click preserves the staged pair and shows a refusal. Reselecting the valid edge already in that slot now retires the refusal. A native evaluation failure remains visible when the evaluated picks stay the same. A changed pick or Cancel can still retire that failure. Notice retirement retains the existing object-identity check.

- **FAIL, previous desktop Studio.** A held two-edge R2 Fillet before a Through Hole accepts both replacement edges. When the first slot is reopened and the second slot's edge is clicked, Studio refuses it. Reselecting the first slot's original valid edge leaves “Edge not selected” on screen while Apply is enabled.
- **PASS, fixed desktop Chrome/WebGPU.** The duplicate still refuses without changing either staged pick. A valid reselect clears its notice with the accepted geometry, document and history unchanged. Preview and Cancel create no history entry. Explicit Apply repairs both slots in one step. Undo returns both held references and preserves the hole. Redo, native Save and fresh Open preserve the repaired feature and hole.
- **PASS, retained native behavior.** The 80 × 40 × 10 mm part retains its R2 Through Hole. Strict native inspection finds both R2 Fillet faces after Apply and fresh Open. The reopened volume is 31,857.1681469282 mm³ and agrees with `32000 − 40π − 20(4 − π)`. The exact saved-file SHA-256 is `fb982f8c87b3079fa4609e29b9f6eaa2d6d2c1a52db903725a980a4786e220d4`.
- **PASS, desktop controls.** In the terminal two-edge control, a real `RADIUS_EXCEEDS_FACE` failure for R2 on a 1 mm wall remains visible when the same edge is selected. Changing the edge removes that notice and yields a valid 175 mm³ part. Cancel and Redo retain the existing history. The D2046 single variable Fillet control also passes. The final browser receipts show zero console errors and zero frozen-source changes.
- **PASS, affected checks.** 28 focused Studio tests, scoped ESLint, Studio types with the CI-pinned TypeScript 5.9.2 and Studio production build.
- **NOT_RUN.** Full local test suites and other browser backends. #20 stays open for broader topology and dependent features. First mechanical CAD is 8/10. Overall CAD is unmeasured.

```sh
# On the previous SHA with the extended driver:
D1987_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-group-through-hole-browser.mjs "$OUT/prior" --prior-same-pick
D1987_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-group-through-hole-browser.mjs "$OUT/fixed"
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/native-refusal" --dual-native-refusal
HELD_VARIABLE_FILLET_FROZEN=1 node apps/cad-studio/test/held-variable-fillet-replacement-browser.mjs "$OUT/single" --wrong-pick-notice
pnpm --dir apps/cad-studio test held-finish-replacement drawing-notice-lifecycle candidate-references
pnpm exec eslint apps/cad-studio/src/state/useHeldFinishEdge.ts apps/cad-studio/test/{held-paired-fillet-group-through-hole,two-edge-concave-reference}-browser.mjs
node "$TSC_592" --noEmit -p apps/cad-studio/tsconfig.json
pnpm --dir apps/cad-studio build
git diff --check
```
