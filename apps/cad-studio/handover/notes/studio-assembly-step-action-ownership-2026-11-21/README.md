# D1490 — Move Assembly Steps action ownership out of Studio App

P4, row 22. Base: `05f7265d798e5fd6a228da227f69fb141ea54066`.

Move batch transfer, member selection, batch Take out and the text-draft lifetime into the existing Steps review hook. Keep the shared selection and document-commit callbacks in App. The transfer and member guards still use the exact document, selection, step, Open intent and Worker generation. Member selection and Take out also respect the instance editor. The text draft follows its step and document session, including unrelated accepted edits. App.tsx decreases from 3813 to 3769 lines.

## Verification

- **PASS, actual before and after.** All six Chrome runs pass. Member selection gives five equal checkpoints, Take out gives five, and batch transfer gives seven. All 17 complete checkpoint objects and all three behavior observations match exactly. Every native Save digest matches between the two runs of its workflow.
- **PASS, actual workflow.** Exact same-name and generated occurrence selection, hidden/missing members, instance Inspector guard, same-context selection clearing, mixed batch transfer, pending Name and Note behavior, keyboard and pointer Take out, Undo and Redo and fresh native Open pass.
- **PASS, affected checks.** 32 Studio tests, scoped lint, Studio types, production build and diff checks.
- **FAIL.** No failures in the qualified runs.
- **NOT_RUN.** Injected delayed callbacks or racing Worker replies, pending text across an unrelated document edit in actual Studio, alternative desktop GPU backends, mobile and full local suites.

Use Node 22.19.0, installed Chrome and Playwright. Run all heavy checks through the gate. Freeze worktree writes while the desktop browser runs. Run the same three drivers against the exact base and candidate; use separate evidence directories.

```sh
node apps/cad-studio/scripts/test.mjs assembly-steps assembly-step-member-selection assembly-step-takeout-selection
pnpm exec eslint apps/cad-studio/src/{App.tsx,app/useAssemblyStepReview.ts}
pnpm --filter @barocss/cad-studio-app build
git diff --check
cd apps/cad-studio
ASSEMBLY_STEP_MEMBER_SELECTION_FROZEN=1 node test/assembly-step-member-selection-browser.mjs "$EVIDENCE/member-selection"
ASSEMBLY_STEP_TAKEOUT_SELECTION_FROZEN=1 node test/assembly-step-takeout-selection-browser.mjs "$EVIDENCE/takeout-selection"
ASSEMBLY_STEP_BATCH_TRANSFER_FROZEN=1 node test/assembly-step-batch-transfer-browser.mjs "$EVIDENCE/batch-transfer"
```

For each pair of receipts, require PASS and compare `states`, `observations` and the ordered `files[].hash` values directly. Keep the receipts and screenshots outside Git.
