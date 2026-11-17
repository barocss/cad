# Inherited frame section protection (#673)

Baseline main a94676902967777ddeea556bd3110f272d19611a. Root section R40 was deleted while a placed frame-member inherited it. Its effective evaluation was initially successful (RHS40x40x3, length300, volume133200mm³); after deletion it failed with FRAME_SECTION_UNKNOWN. Actual Library Remove also deleted R40.

Only editSections removal protection is extended to placed descendant uses through inheritedRowUsed. sectionUses remains a local feature enumeration for the UI; same-ID local overrides stop inheritance. Original local error labels and normal replacement semantics remain.

Verification:
- 26/26 focused tests (inheritance, existing frame-sections/history row, catalogue inheritance). Covers frame-member, frame defaults/member overrides, nested/hidden/suppressed/shared branches, unrelated local rows, local override, unchanged input, unused deletion and valid replacement.
- Core normal replacement to50x30x4 gives172800mm³ (volume tolerance1e-6).
- Model TypeScript and changed-file ESLint passed; read-only review found no blockers.
- Real Chrome Library used-row refusal and original unchanged, unused deletion, normal section width/height/wall edit, Undo/Redo of both flows, Save/fresh Open and changed member render passed.
- 1076-file frozen capsule unchanged, page/console errors empty, browser/server closed.

Limits: no pending revisions/schema/HOLD changes; no full CAD qualification. A separate pre-existing core add/remove-same-ID combination can omit the replacement row. It is not changed or qualified here; current UI and chat file-row loading do not call that same combined core argument path. doc-sync remains stopped.
