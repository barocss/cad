# D1345 — Preserve authored Drawing controls during Fix all (#80)

## Bounded change

Automatic Fix all skips deletion fixes that would remove tolerances, basic dimensions or GD&T frames. Lost controlled dimensions retain their review reason; unverified quantities remain excluded from output. Explicit removal lists the dimension ID and authored controls (including tolerance value) and requires a separate confirmation; Cancel/Escape retains them. The request is bound to the current model, whole drawing settings and sheet. Detail removal retains its existing annotated-detail refusal. Explicit standalone frame removal receives the same disclosure. No quantity inference or geometry changes.

## Verification

- Model focused regressions 34/34 PASS, including tolerance/basic/frame protection, explicit loss descriptions, multisheet retention and unprotected removal. Native projected views with controlled changed-quantity callback are distinguished from the actual browser case below.
- Model and Studio TypeScript, Model focused lint, diff check and final production build PASS. Five pre-existing Workspace unused lint findings remain unchanged; no full lint/CI claim.
- Actual source-frozen Chrome/WebGPU 1024/1440: 40×40×12 plate, four through/counterbore pairs, Auto-dimension, actual ±0.05 mm tolerance, History pattern-centre shift to17/17, Fix all. Original diameter ID/kind/tolerance retained, invalid four-hole quantity absent from rendered sheet and downloaded SVG. Undo/Redo and actual Save/fresh Open retain the controlled dimension. Normal pointer clicks verify disclosure, Cancel, explicit removal and Undo restoration.
- Browser first run failed a test-only null drawing hook during transition. Second run caught confirmation inheriting pointer-events:none from generic hints; fixed only that interactive group. Third run PASS. A screenshot still contains a transient Change not applied computation notice; accepted document changes and downloaded output are separately asserted, and no all-issues-cleared claim is made.
- Actual narrow screenshot visually reviewed: review reason and retained lost dimension, projected sheet present. Receipt SHA256 `b583c567c996ff1a0a9836956656dc94a7e05b68470cb48171b19e3d24dde796`.

No assistive-technology or broad drawing correctness qualification. Existing HOLD unchanged; #20 remains open. Next bounded item #93 keyboard cancel focus restoration.
