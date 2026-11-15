# D1335 — Protect prior annotations during Drawing placement (#110)

## Implementation

One pure drawingCanDeleteSelection policy admits keyboard deletion only with an existing selection, idle Select, and no pending placement/drag/reattachment/rim/target choice. DrawingWorkspace consumes unsafe Delete/Backspace before any frame/target/annotation deletion, preserving both draft and prior selection. The same policy hides the misleading Del remove hint. Existing text input/IME/modifier handling, Escape, explicit list remove buttons and idle Select deletion remain unchanged. No model or drawing geometry changes.

## Independent Mac verification

- Pure policy3/3 PASS: every transient state, no-selection/tool state, immutability and returning to idle Select.
- Studio type-check, policy/test lint, production build, diff check and independent integration review PASS.
- DrawingWorkspace lint has five pre-existing unused names, confirmed in pre-change HEAD: DrawingFix, _sig, _was, _leader, _sheet. Not introduced or claimed fixed here.
- Actual Chrome12 scenarios:1024×900 and1440×900 × Delete/Backspace × datum line/linear dimension/leader note. Existing A3 area, KEEP NOTE and30mm dimension seeded in native bracket fixture. Key during pending placement leaves complete document and pending hint unchanged; misleading Del hint absent. Subsequent real click completes the intended annotation. One Undo restores baseline; explicit Select of old annotation allows deletion with the same key, Undo restores it. Every scenario Save/freshOpen matches baseline.
- Actual1024px pending datum and note screenshots reviewed. Driver test/drawing-pending-delete-browser.mjs receipt SHA256 `2365a19793106b37435dc561c099c1c1867e9911d2c67f9ac8e9b94309914949`.
- First driver failed after successful explicit deletion because canonical empty datumTargets is omitted; corrected test to treat absent array as empty, no product change.

## Limits / next

Standalone frame movement, rim choices and reattachment are pure-policy tested only. Other drawing geometries, mobile/AT and full suite NOT_RUN. CI not awaited; baseline generated-doc drift and all HOLDs persist. Next D1336/#119: preserve variable Fillet endpoint drafts across mode changes, following #44 data-protection ordering.
