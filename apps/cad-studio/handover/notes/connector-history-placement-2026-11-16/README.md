# Owned Connector History placement (#28)

## Scope

`Edit connector placement` is available from a terminal opening or its immediately following terminal connector-body. It edits world Center X/Y/Z and Rotation on the original face. Row, face and parent reassignment are not offered. Native evaluation still refuses off-face or off-plane candidates.

A lazy read of the original History prefix must find exactly one matching parent key/reference and exact planar face name. Held/suppressed/rematched/ambiguous terminal structures are not admitted. Current row identity must be unique. The expected connector keep-out is regenerated from that row, saved center/rotation and original normal; its full saved ID/name/frame/shape/clearance must match exactly. Missing, modified or duplicate keep-outs refuse rather than being overwritten. A row with no keep-out creates none. A previously removed connector-body is not restored.

An accepted edit changes only the opening placement and its proven matching keep-out together. Body reference/ID, parent, row, unrelated nodes and outputs are preserved. Existing History source/worker/permission/draft guards protect admission and late Apply.

## Verification

- Prior actual Chrome baseline displayed no editable dimensions for the opening.
- Model connector-related tests 16/16: native movement/rotation, no-op identity, source identity, volume preservation, missing/modified/duplicate keep-outs, absent keep-out, terminal structure, lost/merged face, invalid parent, opening-only and native off-plane refusal.
- Studio focused History composition/apply tests 35/35, including both connector rows and source/draft/worker ownership.
- Actual frozen-source Chrome: creation and off-face refusal, cancel retaining the exact source, body-row edit, invalid position refusal, center [20,15,10]/90° → [16,10,10]/0°, expected keep-out origin [10.875,7.8,10.31], stable body and outputs, Undo/Redo, reopen/edit, and modified-clearance keep-out refusal without source mutation. No downloads or browser errors. Applied/refusal screenshots reviewed.
- Model/Studio TypeScript, targeted lint and production build checked separately. Initial type failures (optional rotation delete and new refusal-code union registration) were corrected without runtime behavior changes. The post-browser union registration is type-only; no redundant browser replay was needed.

The earlier placement driver now tests the implemented editor rather than expecting the baseline gap. This does not claim general nonterminal feature editing, changed-row ownership, or automatic face repair. Existing WIP and HOLD scopes remain untouched.
