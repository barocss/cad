# D1326 — Evaluate the cage draft before Done (#557)

## Implementation

Studio useCageEditor records evaluation against exact immutable session and document identities. Done requires a matching success receipt, no drag, unchanged source node and existing topology validation. Failed/pending/stale evaluation preserves editor, draft, document and history; Cancel remains available. Effect-local cancellation plus the existing lane rejects late results/rejections. Exact preview also checks document identity. Receipts clear on begin/end.

Pure cageCommitReadiness only selects readiness, never evaluates geometry. CagePanel uses existing Done tool help and explains moving Extrude with the gizmo or Cage Undo. Native geometry admission is unchanged.

## Independent Mac verification

- Pure guard4/4 PASS: matching success, stale/equal-fields different session, new doc, pending/error, cancel, drag and input preservation. No injected async transport test claimed.
- Actual public30×20×16 box with3 subdivisions:54 faces→central top deletion53→boundary Extrude without movement57, actual evaluation refusal. Done click and repeated Enter preserve exact draft/selection/history/original document at1024×900 and1440×900.
- Cage Undo restores53-face evaluable draft. Repeat refusal then actual moveZ gizmo drag moves four new verticesZ16→20. Evaluation succeeds; Done commits57-face open cage. Document Undo/Redo and native Save/fresh Open pass at both widths.
- Failure and moved-ready screenshots visually reviewed. Prior failure toast remains dismissible history of the attempted Done; current Done enables after recovery.
- Final frozen receipt SHA256 `ab34fcfb667c7bcc62dc4c700d6000ae9e82c790c4999078adcfa8ac2d1ca310`.
- Studio type-check, focused lint, production build, diff check and independent race/ownership review PASS. Final general-error wording and receipt cleanup reran guards/type/lint/build/browser.

## Limits / next

Other boundary families, mirror, injected browser worker rejection/out-of-order responses, mobile/AT and full suites NOT_RUN. Existing generated-doc drift and unrelated App lint remain separate; CI not awaited. All HOLDs persist. Next D1327/#559: preserve no-op Crease/Smooth edges Undo/Redo and document history.
