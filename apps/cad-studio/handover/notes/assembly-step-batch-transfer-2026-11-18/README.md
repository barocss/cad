# #207: batch transfer between assembly instruction steps

Existing issue #207 remains OPEN. This bounded change exposes the existing atomic model operation for two or more distinct, exact top-level occurrences. It does not expand the file schema or close the broader assembly-steps roadmap.

## Observed browser runs

- **baseline01 PASS:** public Meta selection of b1/b2 had no single or batch transfer offer. Existing Add selected refused with the accepted document, visible history and Undo/Redo availability unchanged.
- **actual01 PASS:** select b2 (other step), post (already target) and cap (unassigned). Add selected still refuses atomically. Explicit batch transfer changes memberships from `[[b1,b2],[post]]` to `[[b1],[post,b2,cap]]`.
- One Undo restores the complete original document; Redo restores the transferred document. Existing single-part Go/transfer is a positive control and its Undo returns to the batch result.
- Public native Save, same-context Open and fresh-context Open preserve the result. Open clears the prior selected instance. Both runs recorded zero page errors, console errors and source changes, and closed their browser/server.

## Validation ledger

Model focused tests: **18/18 PASS**. Studio focused tests: **16/16 PASS**. Changed-source lint: **PASS** (coordinator report, empty log).

Initial Studio type check failed with TS2322 because `batchOffer` allowed `undefined` but not the helper's `null`. The optional prop type was corrected to include null, without a runtime behavior change. The second type check **PASS (exit 0)** was confirmed by the coordinator. CI is **PENDING**.

Coordinator-confirmed commands (one focused run each, two type-check attempts):

```sh
# packages/barocss-cad-model
TEST_CONCURRENCY=1 node scripts/test.mjs assembly-steps assembly-step-transfer
# apps/cad-studio
TEST_CONCURRENCY=1 node scripts/test.mjs assembly-steps step-explode
../../node_modules/.bin/tsc --noEmit
# repository root
node_modules/.bin/eslint apps/cad-studio/src/app/assemblySteps.ts apps/cad-studio/src/ui/AssemblyStepsPanel.tsx apps/cad-studio/src/App.tsx apps/cad-studio/test/assembly-steps.test.ts
```

Browser driver: `apps/cad-studio/test/assembly-step-batch-transfer-browser.mjs`; its explicit baseline mode is `ASSEMBLY_STEP_BATCH_TRANSFER_MODE=baseline`, and default mode is actual. Both require `ASSEMBLY_STEP_BATCH_TRANSFER_FROZEN=1` and caller-owned execution settings. The baseline run used the pre-change frozen fixture/source, not the current product with baseline assertions.

## Evidence and limits

The three selected screenshots were inspected: mixed selection and the explicit action, transferred target membership, and the same membership after fresh Open. They show synthetic CAD data only.

- [Selected mixed batch](01-mixed-batch-selected.png)
- [Transferred batch](03-batch-transferred.png)
- [Persisted membership](07-persisted-membership.png)

Preservation assertions compare **stored data**: nodes, instances, mates, step metadata and all document fields except step membership. Screenshots are not independent geometric measurements, and no geometric re-evaluation is claimed.

Pattern-style occurrence IDs and whole subassemblies are covered only by pure helper admission tests, not an actual browser pattern transfer. No deliberately delayed pending-action race was executed. Open selection reset is not evidence that every stale-callback race was injected. Nested transfers, playback, motion, collision, manufacturing, new schemas and existing HOLD scopes remain excluded. Private undo-stack internals were not inspected.

`verification.json` records sanitized receipts, counts, image hashes, failure history and pending checks. No local machine paths or user identifiers are included.
