# Split History direction and current plane (#26)

Actual Chrome on baseline 0fe7abab reproduced both remaining failures: History Normal [0,0,0] left Apply enabled, and a real Shift-drag changed At70 to At76 while the HUD title still said `2X+2Y = 70`.

History now rejects a zero or nonfinite direction before evaluation. NodeEditor shows the existing direction advice, disables Apply and also blocks Enter; the generic edit command applies the same basic direction guard and removes invalid handles. Reset and valid input restore the existing workflow. Creation retains its existing >1e-9 admission threshold. History does not inherit that tighter threshold: small nonzero saved normals are left to native validation, preserving the prior contract.

The drag HUD uses the neutral `Edit Split` title and a Plane step derived from current edit values. Normal coefficients are displayed without rounding; only signs and unit coefficients are abbreviated. Bound At resolves through current parameters and preserves its binding until explicitly changed. No changes to native topology, side identity, selection admission, evaluation ownership or commit order.

## Verification

- Model new tests 4/4 and existing feature-handles 15/15 PASS, including zero refusal, no mutation, current At/direction, cardinal plane, parameter binding and small nonzero coefficients.
- Studio focused History ownership, source receipt and dependent Hole tests 12/12 PASS.
- Model and Studio TypeScript and affected lint PASS. Final Studio production build4.17s PASS.
- Final actual Chrome source-frozen run PASS: zero direction advice once, disabled Apply and Enter no-op, valid input recovery and Reset, numeric draft blocks new drag, real Shift-drag At76 with matching Plane76, active HUD zero refusal/recovery, Apply preserves downstream Hole and independent aggregate volume12000−16π, Undo/Redo, reopen and New. No downloads or runtime errors. Both final screenshots visually reviewed.
- Actual baseline and final receipts: /tmp/cad-split-history-plane-baseline and /tmp/cad-split-history-plane-final01. Baseline mode intentionally asserts the old defects, not product success.

Remaining #26 acceptance: loss of the named Hole entry face n1.top needs its own reproduction/recovery check. The existing axis/side Hole miss test does not establish that case. No whole-family, full-suite or CI completion claim. Protected original WIP/HOLD preserved.
