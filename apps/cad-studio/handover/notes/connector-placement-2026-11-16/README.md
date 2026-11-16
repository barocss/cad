# Connector placement acceptance and History gap (#28)

Actual frozen-source Chrome verified existing creation behavior on main `9fbb969c8`:

- A picked original plate top face owns the opening.
- A 17 mm width offset refuses as off-face and leaves the source document unchanged.
- A 5 mm offset with 90° rotation creates the opening at [20,15,10], seats the connector body and creates its named keep-out.
- Independent stadium-area prism formulas agree with plate-cut and connector-body native volumes within 1e-6 mm³.
- Undo/Redo and in-memory reopen retain exact accepted documents; two bodies remain. No browser errors or downloads. Placement screenshot reviewed.

The same run reproduced a real remaining gap: opening History shows `This feature has no editable dimensions.` No position/rotation edit or saved-command re-entry exists. That baseline gap is resolved by the bounded editor in [Owned Connector History placement](../connector-history-placement-2026-11-16/README.md); the driver now verifies that editor.

## Safe follow-up boundary

Do not add a center-only editor: it could leave the connector keep-out behind. A bounded placement editor must validate the current original parent and exact face, then update opening and owned keep-out atomically while the body keeps its opening reference. Do not infer ownership from `connector-n<index>` alone. A user-modified or ambiguous keep-out must not be overwritten. Row changes and new face retargeting are separate scope.

Driver: `test/connector-placement-browser.mjs`, `CONNECTOR_PLACEMENT_FROZEN=1`. No product code changed. Driver syntax and diff checks passed; no redundant type/build run. #28 remains open. Existing WIP and HOLD scopes remain untouched.
