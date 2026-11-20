# Terminal Arc Radius: same finite number preserves Redo

Focused #21 acceptance, no product change. Actual Chrome/WebGPU ran on exact `ec7770754a2b8fa7976c20d13c60cda661293a47`. The later public parent `28d2154486d31fa956eb5654a27548ce464a9bc5` adds unrelated circular History code/tests and evidence, not Arc Radius changes. The permanent focused test uses the Studio test runner.

- On a four-point open sketch (two straight segments, one terminal Arc), R14 → R16 → Undo left an old R16 Redo. A trusted native input produced the literal `14.0`; numeric R14, endpoints and the accepted document were unchanged. The old Redo stayed available and restored R16 exactly.
- At the same branch point, R14.0001 was displayed and admitted as a new edit. It cleared the old R16 branch; Undo restored R14, and Redo restored R14.0001.
- The first private browser harness stopped because it erroneously expected the displayed text `14` instead of `14.0`. The final harness separately required trusted alternate spelling and compared numeric radius while preserving exact other field values.

[Same numeric R14.0, Redo available](05a-same-numeric-radius-redo-preserved.png) · [Old Redo restores R16](05aa-old-redo-restored-radius16.png) · [Real R14.0001 edit clears old Redo](05e-small-real-radius-edit.png)

This does not qualify arbitrary arc owners, joined outlines, driving constraints, cancellation, or the whole issue. Only the focused test and synthetic screenshots are published.
