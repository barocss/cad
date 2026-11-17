# #274 — explicit definition design-brief notes (bounded)

Status: this editing slice passed; **#274 remains OPEN**. No schema change, manufacturing approval, linked revision workflow or broad BOM authoring completion is claimed.

## Product decision

Use existing `Brief.notes`, `confirmField`, `editDefinition` and central `commitParts`. An explicit Save creates a fresh stated Field with the raw 1–500-character text as both value and source, then records user confirmation. Old why/said/confirmation metadata is not inherited. Other brief fields and existing geometry remain unchanged. Equal text is a no-op; blank clearing is refused.

The editor names the definition, revision and affected occurrence IDs. Only eligible top-level, unlinked ordinary made definitions are supported. Shared members must agree in content/revision. Pending revision, linked source, nested/pattern, catalogue/fastener/bought and element scopes or invalid brief data are refused without normalization. The eight existing BOUGHT_BY_DEFAULT kinds and report-dependent coupling are excluded even with bought:false overrides; independent p3 tests cover undefined/false/true without shared-content mismatch. This eligibility is deliberately more conservative than the complete BOM population. Drafts belong to the exact document/selection and an explicit edit session; Cancel, replacement and unmount retire the session. Notes remain design intent, not manufacture approval.

## Actual final run

`/tmp/cad-instance-brief-notes-02` passed after scope hardening. The first run `/tmp/cad-instance-brief-notes-01` also passed the ordinary-box flow, but preceded detection of the default-purchased element/coupling eligibility gap; its curated receipt is retained separately and is not final-source qualification. Neither run failed. Initial UI absence was established statically, **not** by a pre-fix browser failure. The fixture is three synthetic 10 × 5 × 2 mm boxes: p1/p2 share `sharedA`, p3 has `independentB`.

- Cancel leaves the accepted document unchanged; switching from an uncommitted p1 draft to p3 discards the draft.
- Save updates p1/p2 together to Rev B with exact raw Unicode/newline/space text and fresh confirmation; p3 remains unchanged. Independent p3 editing preserves p1/p2.
- Same-value Save is disabled. Two Undo and two Redo operations recover exact accepted documents.
- Node/output/placement JSON is unchanged. No new native mass or shape oracle was run.
- BOM quantity/totals and original purchase CSV bytes remain unchanged. Separate notes CSV parses independently with Python csv/JSON: one quantity-3 row, distinct p1/p2 and p3 complete Fields. The second parser run after reopen has the same input hash.
- The original native Save Blob parses exactly to the accepted document. A fresh public Open preserves it, resets the BOM opt-in, and allows Edit to show exact raw text; Cancel remains a no-op.

Full source capsule: **525** files, identical frozen/after/after-cleanup hashes; initial subset is **6**, not the full capsule. Errors, console errors and source changes are empty. Two contexts, Chrome and Vite closed; heavy gate released and source freeze ended. The curated receipt removes machine paths/full snapshot duplication and retains artifact hashes. Original final receipt remains at `/tmp/cad-instance-brief-notes-02/receipt.json`.

## Checks and limits

- Focused **11/11**: eight new editor/helper tests plus three existing BOM notes UI tests. `/tmp/cad-instance-notes-focused5.log`.
- Studio TypeScript PASS: `/tmp/cad-instance-notes-tsc5.log`; targeted ESLint and driver syntax PASS.
- Final production build PASS, **4.44 s**: `/tmp/cad-instance-notes-build-final.log`, after the runtime import/scope guard change. The earlier 4.37 s build is pre-hardening evidence only.
- Baseline test preserves a typed **sentinel record by identity**; it does not verify an approved digest, approval transition or baseline currentness.
- Session tests simulate token retirement/retry, not React unmount or real rejected commit callbacks. Actual blocked/commit-refusal, injected stale callback, revision-offer workflow and approval currentness remain NOT_RUN. No external sharing, new note schema, linked editing or broader element authoring was added.

## Evidence and privacy

- [Shared definition saved](02-shared-saved.png): Rev B, p1/p2 ownership and design-intent disclaimer.
- [BOM mappings](03-bom-notes.png): quantity 3, shared and independent notes, explicit opt-in.
- [Curated receipt and artifact hashes](receipt.json), [native saved fixture](notes-edited.bcad), independent oracle source and both input/result pairs alongside this note.

Final PNGs were directly inspected by the implementer; parent had separately inspected the pre-hardening run: readable synthetic content, no personal information. Original runner `ROOT_MUST_VIEW_SCREENSHOTS` is historical metadata, not an outstanding review. Numerical source preservation is JSON comparison, not a fresh geometry/mass proof.
