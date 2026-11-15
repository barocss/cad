# D1368 — Unsupported tapered-cap Offset recovery

Base: `1d9707b544554e6a9ab911091159eaaafb1d4dd2`. Resolves #96 at its existing-refusal-area acceptance boundary; no geometry expansion.

## Change

`src/state/commandBuildFailure.ts` recognizes only the exact native congruent-cap VALUE refusal for one current solid face owned by a drafted Extrude. `useCommandPreview.ts` supplies its captured context. The refusal explains that Offset distance cannot enable this cap and directs Cancel → original Extrude in History → Distance. Other causes and selections retain their existing errors. No native admission, kernel, document or availability evaluation changes.

## Verification

- Focused `offset-cap-feedback` tests: 5/5; Model and Studio TypeScript, scoped lint (three files), diff check PASS.
- Actual Chrome `unsupported-taper-cap-recovery-browser.mjs`: 1024 and 1440 desktop widths PASS. R10 half-disk, Extrude height 10 and Draft 14°: top-cap offsets +2 and −1 refuse with disabled Apply and unchanged source. Cancel retains source; original Extrude Distance 8 preserves sketch/draft and changes only height.
- Strict BRep one solid, independent Simpson 8192 cross-section volume oracle (884.9334770852454 mm³ within 1e-6), Undo/Redo and downloaded Save/fresh Open PASS at both widths.
- Production Vite build PASS. No CI/full-suite or full API-doc gate claim; D1365 accumulated API inventory drift remains unresolved.
- Artifact set `d1368-first`; receipt SHA256 `8ea2464b4704a9202f3b4664ddd038fec94d9777bc4e493d3e4a276fc5e65044`.
- Actual pixel review: `1024-unsupported-cap-refused.png` shows readable scope/recovery message and selected half-disk cap; `1440-extrude-recovery.png` shows Extrude 8 · 14°, one solid and recovered properties. Receipt's automated visual-review placeholder is not a visual verdict; this paragraph records the separate review.

## Boundaries and next

This is feedback after attempting Offset, not palette pre-disabling. Unsupported tapered-cap geometry stays refused. #22 remains open: catalog-backed editing of actual Thread designation is not implemented by the drill readout, and broader adjacent/curved geometry is not accepted. Its earlier bounded evidence remains valid. Existing HOLDs unchanged. Next D1369: inspect #140 supported hexagonal-prism side feedback and recovery.
