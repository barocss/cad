# STEP continuity inspection recovery (#141)

The ready STEP export panel explains that Studio inspection may be unavailable after reopening STEP, recommends retaining the original .bcad, and distinguishes missing inspection data from changed geometry. The redundant native-history sentence was removed from the profile paragraph; the existing loss-report item remains.

Only the actual missing-pcurve continuity refusal receives the conditional original-.bcad recovery. Other refusal reasons retain their existing guidance. No geometry, STEP bytes, continuity algorithm, or import behavior changed.

## Verification

- Focused help and STEP preparation tests: 16/16 PASS. Changed-file lint and Studio typecheck/build PASS.
- Actual Chrome WebGPU at 1024×900 and 1440×900, both Circular R2 and G2 R2/Tension 0.5 on 30×12×20 box: native upper interfaces measured; actual .step downloaded and reopened; corresponding 1/3 upper interfaces refused with missing-pcurve and new recovery. Strict B-rep valid and volume preserved within 1e-5 mm³. Actual saved original .bcad reopened and native measurement recovered without stale refusal.
- Export has a single native-history-loss mention; inspection notice and refusal screenshots reviewed. Repeated G2 candidate inspections preserve the document.
- Existing fillet-continuity browser regression PASS, including native measurements, unsupported end recovery, keyboard focus, and Undo/Redo clearing inspection.

Initial driver runs corrected narrow-toolbar overflow menu semantics and a fixture output key (b2 for feature n2); no product behavior was changed for these harness mismatches. Initial test-fixture type assertion was corrected before the successful final build.

## Limits

Only Studio's exporter/importer and these two models. No external reader, all-format guarantee, assistive-device test or claim that inspection data round-trips. Desktop source .bcad was constructed with native feature history and then saved via UI. #126 WIP untouched.
