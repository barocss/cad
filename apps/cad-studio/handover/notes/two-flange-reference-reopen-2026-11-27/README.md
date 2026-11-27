# D2053 — Keep two confirmed Flange references on fresh Open

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md) · SMALL · [#20](https://github.com/barocss/cad/issues/20), original checklist rows 1915–1917. Product base `d010801dd0b894c902becc5686c2c763332d0018`.

Reconstruct the earlier file from the retained two-Flange fixture. Sign the 80 × 50 mm plate with square corner relief and two 20 mm upper Flanges on their actual parent shapes. Resize the fixture to 95 × 65 mm while retaining the original edge signatures, then open it in desktop Studio. This is a legacy-file recovery test. The current History resize command has its own admission rules.

- **PASS, desktop Chrome.** File Open holds both Flanges and displays 9,249 mm³ of stock. Candidate preview selects an edge without changing the accepted document or history. Escape clears the selection and preserves both choices. `Use candidate` applies only the selected Flange. Downstream-first builds a valid single bend at 10,879.689131381849 mm³. Upstream-first builds a valid single bend at 11,668.732259469813 mm³.
- **PASS, native geometry and persistence.** Both orders rebuild the same two bends at 13,299.42139085167 mm³. The written signatures match each Flange's current native parent. Two Undo steps restore both choices, and Redo restores both bends. Each order survives actual Save and Open in a fresh browser context. Studio shows a 112.393 × 82.393 mm flat pattern with two UP 90° bends. The native bend spans are 92 and 62 mm.
- **PASS, affected checks.** Studio candidate and History replacement tests 24/24, Model references 44/44, scoped ESLint, driver syntax and diff check. Final desktop run has 12 scenes, zero page or console errors, and 1,245 source files unchanged through cleanup.
- **FAIL, first driver run.** It waited for optional History-navigation labels in the Flat dialog. The repaired legacy file displayed both bends in the drawing and angle list. The final driver verifies those outputs. Scoped lint also caught an unused test binding before the final run.
- **NOT_RUN.** Local full suites, local production build, DXF export and mobile. First mechanical CAD remains 8/10. Overall CAD remains unmeasured.

## Original #20 acceptance

| Requirement | Evidence |
| --- | --- |
| Distinguish held, automatic match and explicit acceptance | [D995](../split-finish-reference-open-2026-11-13/README.md) holds a displaced Split finish until confirmation. [D1001](../draft-flange-reference-comparison-2026-11-13/README.md) distinguishes a unique Flange match from an ambiguous candidate list. [D1007](../legacy-unconfirmed-finish-open-2026-11-13/README.md) restores pending approval for an already-saved unconfirmed finish. |
| Show original and candidates, keep confirmed references on reopen | [D1243](../split-finish-native-save-2026-11-14/README.md) qualifies Split Fillet and Chamfer. [Desktop Draft face recovery](https://github.com/barocss/cad/issues/20#issuecomment-7033457699) qualifies preview, apply and reopen on a reversed Split. D2053 qualifies the two-Flange case. |
| Pick the replacement edge in History | [D998](../held-finish-history-repick-2026-11-13/README.md) and [D1003](../concave-fillet-history-reference-2026-11-13/README.md) qualify direct History picks, including the concave replacement edge. D1243 verifies standalone persistence. |
| Undo restores geometry and choices together | [D996](../split-finish-reference-history-2026-11-13/README.md) and the [desktop Split multi-reference replay](https://github.com/barocss/cad/issues/20#issuecomment-6879124539) verify both states. D2053 verifies both Flange holds return. |
| Hole and linked inset checklist context | [D1000](../hole-history-centre-axes-2026-11-13/README.md) and [D1002](../split-hole-reference-open-2026-11-13/README.md) qualify Hole centre labels and a missing Split face. [The desktop planar inset replay](https://github.com/barocss/cad/issues/20#issuecomment-6879124681) verifies a supported linked edit with its Chamfer. [D999](../linked-inset-retired-finish-boundary-2026-11-13/README.md) verifies atomic refusal of files with an unsupported finish on a retired rounded-inset edge. |

These records satisfy the original reference-decision bug. General topology editing, live finish recovery on unsupported rounded-inset recipes, and new feature combinations require their own acceptance.

```sh
D2053_SOURCE_FROZEN=1 node apps/cad-studio/test/two-flange-reference-reopen-browser.mjs "$OUT/studio"
pnpm --dir apps/cad-studio test candidate-references held-finish-replacement
pnpm --dir packages/barocss-cad-model test references
pnpm exec eslint apps/cad-studio/test/two-flange-reference-reopen-browser.mjs
node --check apps/cad-studio/test/two-flange-reference-reopen-browser.mjs
git diff --check
```

Desktop receipt SHA-256 `195c5555c9db6b3818b761e2023b7fa51c153d970a0d5daa8487fce006caa438`. Repaired native file SHA-256 `d96ec818980f23a2b6935057ab6b0e269f8d2d3e563e179161fce34c6c9cd107`.
