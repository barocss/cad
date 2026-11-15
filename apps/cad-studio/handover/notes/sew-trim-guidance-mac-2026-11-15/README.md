# D1316 — Explain selected trimmed Sew surfaces (#545)

## Scope and implementation

Direct Sew now lists ordinary stored trimmed members by selection position and name before execution. It explains that Sew uses whole support surfaces, and that manual Untrim removes all trim boundaries including openings. Sew is disabled and handler-guarded while such a member remains. Nothing is untrimmed automatically. The model's original Sew snapshot guards remain authoritative and unchanged, including malformed-container rejection.

Source: `src/ui/sewTrimBlockers.ts`, `src/ui/DirectPanel.tsx`. Tests: `test/sew-trim-blockers.test.ts`, `test/sew-trim-blockers-browser.mjs`.

## Independent Mac evidence

- Original D339 seed SHA256 `e5348dc4f6ca7b83d04f279a8dc2af96d26a11c39c7540becb900200b4ee5689`; actual public Trim creates the xmax opening (160 UV points).
- Six selected surfaces remain selected; document unchanged. The sixth member is identified as `6. D339 · xmax`, with whole-support and opening-removal guidance. Actual 1024×800 screenshot visually reviewed after scrolling the existing panel to Sew.
- Trim Undo/Redo preserves history. Explicit manual Untrim restores support; Sew preview and Apply recover. Sew Undo/Redo and native Save/fresh Open preserve accepted document and ordered names.
- Final browser receipt SHA256 `a937b013e291a770b0e259eb9eaa5fb2d567e9a7e03bba377a1b2f09ef51dee7`, PASS. Product source frozen during browser execution.
- Unit test covers ordered multiple blockers, duplicate names, reordered selection, empty/untrimmed inputs and non-mutation; it is metadata logic, not geometric trim validation.
- Studio type-check, focused ESLint, production Vite build and independent source review PASS. Existing build warnings remain.

## Limits / next

Multiple trimmed surfaces and nonstandard selection order are unit-only. Assistive technology, mobile, other geometric fixtures and full suites NOT_RUN. No new native geometry admission or tolerance changes. Existing generated-doc consistency failures are not addressed or represented as PASS. All roadmap HOLDs remain. Next D1317 / #546 aligns two-guide Loft field errors and completion state.
