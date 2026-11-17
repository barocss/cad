# Atomic assembly instruction-step transfer

Base `5dedb1d7e`. For a single selected top-level part already assigned to a different instruction step, the panel now offers **Move [part] here**, alongside the existing Go to its step action. This explicitly transfers membership with one document commit and one Undo. Add selected remains non-transferring and refuses duplicate assignment. No schema, part placement, geometry, mate, source definition or BOM change.

The model helper validates all requested occurrences before editing, deduplicates requests, retains destination order and appends incoming occurrences, removes their old memberships, and preserves empty source steps and metadata. Unrelated unresolved references remain held. Grounded parts can change display-only step membership without moving physically. The removal lock follows the destination.

## Verification

- Model assembly-step tests: 18/18 PASS, including four new atomic transfer cases covering mixed assigned/unassigned selections, duplicates, identity no-ops, unknown destination/base/missing/nested refusal, preserved metadata/physical assembly, empty sources, removal locks and native read.
- Actual Chrome flow PASS using the existing synthetic assembly-steps fixture. Existing Add refusal preserves the whole document. Explicit Block 2 transfer changes `[b1,b2]/[post,cap]` to `[b1]/[post,cap,b2]`. Instances/nodes/mates and all step metadata remain equal. One Undo restores both lists, Redo reapplies both, previous/next membership agrees, and downloaded native Save/Open in a fresh context retains the result.
- Model and Studio type checks, focused ESLint and diff checks PASS. Latest independent main `d7aca897c` integrated by fast-forward; assembly-step tests rerun 18/18 PASS.
- Before/reopened screenshots visually reviewed; destination chips and step counts 1/3 are readable. Frozen source unchanged through browser and cleanup.
- This is an additive capability, not a previously failing browser bug. No fabricated baseline failure is claimed.

Reproduce from root with Node 22:

```
node packages/barocss-cad-model/scripts/test.mjs assembly-step
node node_modules/typescript/bin/tsc --noEmit -p packages/barocss-cad-model/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
ASSEMBLY_STEP_TRANSFER_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/assembly-step-transfer-browser.mjs <fresh output>
```

UI is single top-level selection; model batch behavior is tested separately. This remains display-only instruction authoring, not assembly planning, physical motion, collision, manufacturing or neutral-export qualification. Existing #207 HOLDs remain; issue stays open.
