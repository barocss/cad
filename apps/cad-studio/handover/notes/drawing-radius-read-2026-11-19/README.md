# #202: opt-in geometric radius discovery

This bounded addition reads existing radius dimensions with `drawing.dimensions` / `get_drawing_dimensions` and strict optional `include_radii`. It does not complete #202; the issue remains **OPEN**. Validation base: `4d31a90b3`.

## Observed results

- **baseline01 PASS:** the existing intentional API scope returned one default linear row or two diameter-opt-in rows while Studio already displayed a resolved radius and a retained lost radius. This was not document corruption or an existing-contract violation.
- **actual01 PASS:** four saved/UI dimensions; default **1**, diameter-only **2**, radius-only **3**, both options **4**, preserving original order. The geometric radius matches the resolver exactly and the independently authored 4 mm expectation within 1e-9 mm absolute. Inch/dual printed labels remain distinct from raw model millimetres.
- Resolved radius rows contain only id/view/kind/resolved/value. Unresolved radius rows contain reason instead of a numeric value. Free Note text is absent from the API response. Existing default/false and diameter/false contents remain byte-equal; revision and other response fields remain equal across options.
- Fourteen malformed-option refusals (seven values through each local public facade and direct dispatcher) preserve the accepted document. UI document, dirty state, visible history rows and Undo/Redo availability remain unchanged by inspection.
- One actual native Save download per run, semantic equality and fresh Open pass. The repeated post-open public results match. Both receipts report zero errors, zero console errors, zero frozen-source changes, and browser/context/server cleanup.

## Validation and history

The first baseline and first actual runs both passed. No failed browser attempt is represented as a successful run. Model dedicated/related checks: **27/27**; toolset checks: **10/10**, measured per-turn character budget **24,997 / 25,000**. Model and Studio typechecks and scoped lint passed. Tool-contract snapshot update procedure was used, but it produced no snapshot delta. Log digests and selected source/driver hashes are in `summary.json`; this is a curated summary, not a raw receipt.

## Evidence and limits

`baseline.png`, `actual.png`, and `reopened.png` are unchanged copies of synthetic Studio captures. They show the UI, not the API response. The API assertions execute the real local public facade/dispatcher against a copy of the Studio-accepted document. **External MCP NOT_RUN. Independent geometry certification NOT_RUN.** Native projected-reference setup is synthetic, not mouse annotation authoring. Actual coverage is one base-part sheet; no actual multi-sheet, general geometry, fit/manufacturing interpretation, stack expansion, or full-suite claim is made. Existing geometry/annotation storage and unresolved references are preserved; no Fix or automatic annotation acceptance is performed.

`SYNTHETIC_PRIVATE_RADIUS_NOTE` is deliberately fabricated test text, not private user information. No raw receipt, HTML, local filesystem path, authentication data, or personal data is included. The PNGs were visually checked for this synthetic-only scope.

At evidence preparation time, commit, push and exact integration CI are **PENDING**. Existing HOLD boundaries remain unchanged.
