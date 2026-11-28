# D2171 — Identify omitted named root datums during STEP preparation

P2 [row 13](../../roadmap-rows/13.md) and [row 16](../../roadmap-rows/16.md) · [#205](https://github.com/barocss/cad/issues/205) · Base `5deda61d896b5f4c5d65dab4dfedca705f961db5`.

The existing STEP geometry profile omits authored named reference datums. Its Studio preparation report now carries the omitted root datum ID, name and kind. The user can expand those entries under the current loss report. Same-name datums remain distinct. The export Worker supplies the descriptors for the same document revision as the bytes. The STEP writer, saved document and public Part report fields keep their existing formats.

## Verification

- **PASS, actual desktop Studio WebGPU.** The base showed the generic loss only. The final preparation lists D1 and D2, both called F_SETUP but with distinct authored frames, and D3 with its original Korean name. Cancel keeps the native source. Browser-project Save, closing the project and fresh Open retain all three IDs, names, origins and bases. Repreparing displays the same omission metadata and retains revision `50fba3c7906cb942`.
- **PASS, independent shape readback.** The prepared STEP contains one manifold B-rep, eight distinct referenced corner coordinates and bounds 80 × 50 × 10 mm. The independently computed volume is 40,000 mm³. The actual Worker-produced DATA section is byte-identical with and without the authored datums, with SHA-256 `d6962fbb59ba98a79b54c97dea435540f8b34a931e931480d1d266886650c03d`. The STEP includes geometric placement entities and omits the authored datum names. The source revision in the header changes when datums are present.
- **PASS, affected checks.** 32 Model and 18 Studio tests, both package type checks, scoped lint, production build, driver syntax and diff check. The final desktop flow reports zero page or console errors, downloads and changes across 1,284 frozen files.
- **FAIL, corrected test assumptions.** The first browser observer looked at the generic reply envelope. The final observer captures the actual STEP reply. The archived base has 17 passing and two failing public STEP report tests. Those two still expected printable Unicode substitution from before the current writer policy. The final tests assert existing lossless product and native face name encoding. The public compatibility check compares the declared public fields, so the Studio-specific descriptors do not widen that contract.
- **NOT_RUN.** Semantic STEP datum transfer and adoption, named occurrence frames, external CAD, outbound downloads, physical manufacturing, mobile and full local suites. #205 remains open for selectable semantic exchange. First mechanical CAD remains 8/10. Overall CAD completion is unmeasured.

```sh
STEP_ROOT_DATUM_LOSS_SOURCE_FROZEN=1 node apps/cad-studio/test/step-root-datum-loss-browser.mjs "$OUT/baseline-revised" --baseline
STEP_ROOT_DATUM_LOSS_SOURCE_FROZEN=1 node apps/cad-studio/test/step-root-datum-loss-browser.mjs "$OUT/final"
pnpm --dir packages/barocss-cad-model test step-profile-losses api-step-report step-units
pnpm --dir apps/cad-studio test step-export step-metadata
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
