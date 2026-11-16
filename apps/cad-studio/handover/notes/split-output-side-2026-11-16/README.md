# Split output-side selection (#26)

## Contract

Split creation and terminal History offer Both / Negative / Positive. The optional node `outputSide` stores negative or positive; absence retains the existing Both behavior. The saved plane normal defines the signs, and reversing it swaps their spatial sides. Existing negative/positive native IDs and body keys are never renumbered or promoted to solid.

This is an explicit Model output contract, not hidden-body state or deletion of native topology. The kernel still computes both halves. leafBodies, prefix normalization and the Model partSnapshot boundary expose only the chosen unconsumed output. Exact native output IDs are filtered, preserving unrelated bodies. Studio and generic History edits rebuild the stored output map atomically. Model-based shape export sees the same outputs; no kernel modification or schema version migration.

A retained side may feed a later Move or other feature. Output-side changes are available only while Split is terminal. Excluded-side references and invalid saved selectors are refused at file Open and Model build/prefix boundaries, rather than silently reviving a discarded output or reconnecting dependents. The editor explains the preserved choice when later features lock it.

## Verification

- Model focused5/5 PASS: cardinal4800/7200 mm³, exact side IDs/bounds, prefix/worker/Open, retained-side Move, excluded raw reference and invalid selector refusal, unrelated body preservation, oblique4500/normal reversal7500 mm³, in-memory STEP one-body output.
- Studio History8/8 PASS, including output-map commit normalization; Model/Studio TypeScript and affected lint PASS; Studio build4.45s PASS.
- Actual desktop Chrome split-output-side-browser PASS: creation Negative, History Positive→Both→Negative with each Undo/Redo, file reopen, actual Move on retained negative, one visible/native body after Move/reopen, protected downstream selector, oblique normal reversal with stable negative key. Strict B-rep and independent volume checks. No downloads/runtime errors. Positive-output and downstream-protection screenshots visually reviewed.

## Limits

Standalone native-part document serialization does not carry this Model output selection; no round-trip support is claimed for that lower-level representation. No historical file migration, arbitrary downstream output-side change, topology removal, generalized plane picking or other #26 completion claim. Existing #126 WIP and all HOLDs preserved.
