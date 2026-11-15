# D1317 — Two-guide Loft field feedback (#546)

## Change

The HUD maps identified native two-guide refusals to the responsible selector: missing Guide 1, duplicated Guide 2, guide endpoint corner mismatch, and middle-control section-midplane mismatch. Each mapped refusal is shown once beside that field with `aria-invalid` and `aria-describedby`. The duplicated Guides/general notice is suppressed only for these mapped errors. Unmapped errors retain their original general detail. Guides cannot show completed before a successful native preview. Existing single-guide feedback and all native admission checks are unchanged.

Files: `src/app/loftTwoGuideFeedback.ts`, `src/ui/Hud.tsx`, `test/loft-two-guide-feedback.test.ts`, `test/loft-two-guide-feedback-browser.mjs`.

## Independent Mac verification

- Actual 1024×800 Chrome/WebGPU, original issue geometry: XY rectangles 10×6 at Z0/Z12, rails A/B with middle controls [2,0,6]/[14,0,6].
- Second-only, duplicate, second endpoint Z11, second middle Z5 all refused with one field-local status and disabled Apply. No misleading completed Guides row; selected sections, document and input values preserved.
- Choosing valid B clears invalid semantics and restores preview. Apply, Undo/Redo and native Save/fresh Open pass. Independent native oracle verifies strict B-rep and analytic volume 819.84 mm³, guide controls and side samples.
- The actual intermediate-height screenshot was visually reviewed; the explanation is visible without expanding kernel details.
- Unit 2/2, Studio type-check, focused ESLint, production Vite build, independent source review PASS. Existing bundler warnings remain.
- Final browser receipt SHA256: `0f30287c76a6e0930ec7247b2179e72043579eb8c40eeb02e5a35265bd659fb8`.

## Corrected checkpoints and limits

Initial actual browser run caught build-level DIRECT_PICK text carried in `hint`, not `detail`. Only that exact coded message is accepted from hint; native endpoint/midplane matching stays on detail. A test-fixture cast and initial JSX parse issue were corrected before final validation.

Guide 1 endpoint/midplane mapping is unit-only. Different section families, assistive technology, mobile and full suites NOT_RUN. This is UI feedback, not broader Loft support. Existing generated-doc consistency failures remain separate. All HOLDs retained. Next D1318 / #499: investigate same local geometry IDs in distinct source curves blocking Direct Sweep, preserving source identity and history.
