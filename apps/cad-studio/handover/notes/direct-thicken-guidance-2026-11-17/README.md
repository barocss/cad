# #29 — Direct Thicken preflight guidance

Bounded UI correction; **#29 remains OPEN**. No Model/native algorithm, tolerance, shape support, schema, automatic Untrim or live-link change. Protected CurveTools At-t/Split WIP and all HOLD scopes remain unchanged.

## Before and after

The original fixture is `handover/notes/trimmed-surface-region-2026-10-30/studio/run-01/outside-hole.bcad`, selected `obj_3` / `D341 · panel · region 1`.

The first baseline actual run `/tmp/cad-thicken-guidance-before-01` reproduced the gap: the trimmed surface had an enabled Thicken start button with no local preflight explanation. Clicking it produced the existing Model refusal, “untrim the surface first; Thicken uses its whole support surface.” No command/editor or document change occurred. This PASS is a successful **defect diagnostic**, not correct-product acceptance.

The UI now applies the same trim condition as `thickenSnapshot`: undefined or empty array permits start; nonempty or malformed metadata blocks it. The button describes both the restriction and the existing `thickenCommand.hint` about copying a whole surface into an independent body. The note explicitly says Untrim removes stored trim loops and is a separate explicit edit. Thickness validation and authoritative Model/native admission remain unchanged. An enabled button is not a guarantee that every native surface is supported.

## Actual acceptance

`/tmp/cad-thicken-guidance-after-01` passed on the first after-change run:

- Original trim opening and accepted document remain unchanged; start is disabled and connected to the local explanation with `aria-describedby`.
- Public, explicit Untrim removes the stored loops. Source strings remain exact, the whole support surface is shown, and current guidance/start availability update.
- Thicken command entry and Cancel preserve the accepted untrimmed document. No Apply/solid creation is exercised in this run.
- Undo restores the original document/trims and disabled start; Redo restores the explicitly untrimmed state and enabled start.
- Full frozen source capsule **527** files is identical before/after/after cleanup. Runtime errors, console errors and source changes are empty. Context, Chrome and Vite closed; gate released, source freeze ended.

## Checks

Initial focused run: **6/7**, with one existing test expecting `aria-describedby` to equal only the thickness error ID. The product now deliberately includes the new scope ID plus that error ID. The assertion was corrected to verify both IDs without removing the original error linkage. Original failure remains `/tmp/cad-thicken-guidance-focused.log`.

Final focused: **7/7** (new guidance 3, adjacent surface-domain 4), `/tmp/cad-thicken-guidance-focused2.log`. Studio TypeScript and targeted ESLint PASS; production build **5.36 s** PASS. Logs: `/tmp/cad-thicken-guidance-tsc.log`, `/tmp/cad-thicken-guidance-lint.log`, `/tmp/cad-thicken-guidance-build.log`. Independent source review found no blocker.

## Limits / existing evidence

This run does not re-prove native volume, later source-move/solid independence, broader curved/trimmed Thicken support, assistive technology or full CAD suites. Existing [D1388](../direct-thicken-draft-mac-2026-11-15/README.md) has its own valid-plane native numeric/SaveOpen evidence; it is not a fresh numeric test here. Current snapshot independence wording comes from the existing command hint and Model snapshot contract. The new tests verify preflight state, metadata preservation and current-source transitions only.

## Evidence and privacy

- [Before: click then Model refusal](before-02-model-refusal.png)
- [After: original trim, local explanation and disabled start](after-01-trim-preflight.png)
- [After: explicit Untrim, whole surface and independent-snapshot explanation](after-02-untrimmed-scope.png)
- [Before curated receipt](before-receipt.json), [after curated receipt](after-receipt.json)

Both implementer and parent directly inspected these pixels: original opening/full-face distinction and wording are readable; synthetic geometry has no personal information. Receipt `ROOT_MUST_VIEW_SCREENSHOTS` is retained historical runner metadata; review has since completed. Curated receipts omit machine-specific full snapshots/paths, retain source custody and image SHA256. Raw receipts remain in the named run directories.
