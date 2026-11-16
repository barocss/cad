# Fastener group editing from ordinary History (#31, partial)

Ordinary History now offers **Edit Fastener** for a saved, exactly replayable Fastener group. It routes to the existing grouped command rather than editing guessed component dimensions. Any member resolves to one proven owner; partial, altered, malformed and overlapping groups are refused. Existing terminal modelled-thread groups that shapeEdit cannot replay remain unsupported.

The command preserves saved size, joint, placement and hole-fit evidence. Insert mode is not exposed: the saved group belongs to the current part, and an attempted assembly insertion is refused rather than dropping the group. Legacy too-small-hole records can open for repair, but ordinary rebuild still enforces fit. NodeEditor disables the transition while its own draft is changed or pending. The composition layer checks current document/evaluation/worker, master/latest History, draft and edit permission. A live ownership predicate persists through the active command and is checked by App before Apply or queuing; stale HUD snapshots cannot apply replacement values. App retains commit/undo ownership.

## Verification

- Model related regression: 25/25; final focused ownership/replay and fit cases: 11/11. Full Model TypeScript and targeted lint pass.
- Studio History composition and HUD action tests: 33/33 PASS. They cover entry, retained placement evidence, stale document/evaluation/worker/marker/variant, drafts, busy/fresh state and permission; full Studio TypeScript, targeted lint and production build pass.
- Frozen actual Chrome driver `test/fastener-history-browser.mjs`: open cosmetic M6 washer/nut/bolt group via ordinary History; Cancel X44 without mutation; M8 against saved Ø6.6 evidence refused; X44 group reposition, Undo/Redo, memory-file reopen and same grouped editor values retained. No physical downloads, source mutations or browser errors. Screenshot reviewed.
- Private evidence: `/tmp/cad-fastener-history-browser-02/receipt.json` and three screenshot/state pairs.

## Remaining issue scope

This does not add persistent hole references or automatic following. Hole movement/reposition guidance and Mount catalogue/group History remain open in #31. Unsupported or edited-out-of-provenance groups are not inferred from their shape. Existing #126 WIP and native-folder/Physics/manufacturing HOLD ranges remain untouched.
