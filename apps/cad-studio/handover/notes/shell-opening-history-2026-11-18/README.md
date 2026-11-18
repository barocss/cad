# Terminal plain-box Shell opening History (#690)

Base: `945a1431285445b1b1e0607de28f2e8aaafb48be`. This is task-local validation evidence, not roadmap synchronization or general Shell qualification.

## Contract

Three-node upright numeric rectangle → positive undrafted Extrude → terminal numeric Shell only. History offers Closed, Top and Bottom (the original box caps along Z). Apply the opening separately from Wall. No downstream features, arbitrary faces, multiple openings, bound dimensions, explicit sketch planes, held/suppressed/recipe nodes, direct geometry or assembly instances are admitted. Existing Shell Wall edits and special Shell generation remain unchanged. No kernel/schema/HOLD expansion.

The unchanged parent prefix must pass complete native cuboid incidence proof and exact body/cap ownership, position, outward normal and area checks. The old opening signature must match that parent; a newly selected cap receives its own native signature. Closed mode drops unused signatures. Missing/stale/shared/foreign references refuse instead of guessing or repairing them. Raw opening changes cannot bypass proof through simultaneous fields. Prefix and full responses require the same document, editor draft, session, worker, open scope and revision.

## Actual desktop evidence

- Original baseline: UI body selection → Modify → Shell Wall 2 creates a closed Shell. History has Wall but no Opening. Native Save/fresh Open preserves it.
- Fixed: Closed → Top → Bottom → Closed; exact document changes limited to opening/signatures, Wall 2 unchanged; Undo/Redo and each native Save/fresh Open/re-edit pass.
- Mixed Top + Wall 11 explicitly refuses; Wall 11 alone reaches native thick-wall refusal. Accepted document/history/geometry remain intact. Wall 2 + Top then applies; Bottom draft Cancel preserves Top, followed by Save/fresh Open.
- Four actual worker replies held only at delivery (no fabricated result): prefix/Cancel, prefix/New+Discard, full/Cancel, full/Open+Discard. Late replies cannot change the original or newer document/history.
- Strict B-rep checks: one body; closed cavity has two closed shells, open cavity one. Independently authored 40×30×20 stock and Wall 2 give closed volume `24000 − 36×26×16 = 9024 mm³`; either open cap `24000 − 36×26×18 = 7152 mm³`. Cap loop counts and inner floor/ceiling Z/normal distinguish Top from Bottom, not volume alone. Tolerance `1e-7 mm³`.
- Existing STEP Shell Wall-limit regression and existing conic opening recovery at 1024×800 / 1440×900 pass, including native geometry, Undo/Redo and Save/Open.
- Successful browser capsules are unchanged through cleanup, with zero page/console errors. See `evidence.json` and `native.json`. Images were visually inspected locally.

## Checks and retained failed attempts

Model focused tests 10/10 and Studio focused History/reference tests 48/48 pass. Scoped lint and diff checks pass. Full repository test suite NOT_RUN. Model and Studio type checks PASS; production Vite build PASS (10.82 s). Exact pushed-commit CI is linked in the issue completion comment.

Baseline-01 did not reach Shell: Space on a focused Browser body row activated Rename instead of opening the palette. Fixture now uses visible Modify → Shell; baseline-02 passes. Existing wall-regression-01 stopped before evaluation because its relative fixture requires Studio cwd. It was rerun unchanged from Studio as wall-regression-02 and passed. Neither attempt is represented as a product failure. Subsequent stages skipped by each failing batch are not claimed executed in that batch.

The baseline's sole exported topology helper change has no runtime behavior effect; final actual source and driver were frozen together. Signed-zero JSON normalization is covered separately in a focused native signature roundtrip test.
