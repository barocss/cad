# Clear profile owns fresh side identities (#656)

## Actual boundary

Baseline `cbb4ef3d8`: tagged triangle (0,0), (40,0), (8,30), Extrude 10, constant R1 on `n1.side[e1]|n1.top`. Actual Edit sketch → Clear profile → Line redraw translated +Y8 → Finish retained e1/e2/e3 and applied the old Fillet to the new outline. The source signature still named midpoint (20,0,10). Native strict B-rep accepted both shapes (volume 5991.479840096534 / 5991.47984009648 mm³). The defect is deleted identity reuse, not an assertion that a normal dimension edit may not move a named edge.

Clear now reserves the removed IDs in the transient draft. Finish renumbers collisions, including already allocated Trim IDs, and allocates missing IDs above the reservation. Ordinary editing without Clear is unchanged. Duplicate/unsupported/unsafe-integer IDs refuse without mutating source snapshots. Normalized authored construction cannot restore a retired legacy ID. Clear removes obsolete main/positional/band source state; draft Undo/Redo restores the previous state and reservations. No model serializer, document schema, native matcher or binding contract changes.

Band names have their own identity contract, so saved-band or new-band replacement after Clear is explicitly refused. Escape cancels the draft; reopen edits the original band. This is not new Band identity allocation. Linked/legacy/Trim combinations beyond the tests below are not generally qualified. This is a Clear-only draft reservation, not a persistent high-water mark or a fix for every deletion operation.

## Verification

- Focused tests: 22/22 (`cleared-profile-identity`, `draft-sketch-history`, `draft-selection-history`). Includes old-ID collisions, attached circles, missing IDs, duplicate/unsupported/overflow, immutable source, legacy construction, repeated Clear and exact Undo/Redo reservations/main IDs/positional references.
- Scoped ESLint and diff check PASS. Studio `pnpm run build` (type check + production build) PASS; final duration recorded in the issue.
- Final actual Chrome: old Fillet reference is missing and Finish refuses atomically, preserving exact original Doc and native geometry. Draft Line Undo restores the source; Escape preserves it.
- Independent plain triangle redraw succeeds with e4/e5/e6, expected native six vertices and 6000 mm³. Undo/Redo and physical Save → fresh context Open retain the exact document/native result. No transient reservation is serialized.
- Existing Clear regression: two Clear clicks add one undoable removal; keyboard/button Undo/Redo restore original material+construction; redraw/Finish PASS.
- Band: immediate Clear Undo/Redo restores the original band. Clear → Rectangle → Finish refuses with visible recovery guidance and preserves the original document/body. Escape → reopen → Width 3→4 succeeds with original e1/e2 sources; analytic expected volume 1343.7167544041135 mm³ vs native 1343.7167544041145.
- Final primary run froze 1076 source files; Band and existing-Clear runs froze 561. Each respective source capsule stayed unchanged through cleanup. Runtime/console errors 0; owned contexts/browser/server closed. Screenshots were inspected.

## Failures retained, not relabeled

1. First fixed driver passed refusal/native retention/draft Undo, then looked for a nonexistent Sketch `Cancel` button. It failed. The real Escape path corrected the fixture.
2. A retry used the wrong working-directory prefix for that patch. It was stopped during page startup, with cleanup verified; later checks were NOT_RUN.
3. First Band test incorrectly expected Undo after a newly placed Rectangle. Actual Undo was disabled. Original `cbb4ef3d8` also exhibits this pre-existing behavior: recorded separately in #658. Immediate Clear Undo and Line redraw Undo are distinct supported paths. The UI guidance was changed to the verified Escape/reopen recovery, not a nonexistent general Undo path.
4. First temporary-original run observed that same Undo limitation but failed its source-event guard due to delayed filesystem notifications from switching the two owned files. A quiescent frozen rerun passed. Both owned files were automatically restored and their SHA-256 hashes matched their backups.

## Reproduce

Use Node 22, the existing Playwright cache and installed Chrome. Acquire the shared heavy gate and freeze source writers first. Outputs must be outside the repository.

```sh
pnpm --dir apps/cad-studio test cleared-profile-identity draft-sketch-history draft-selection-history
cd apps/cad-studio
SKETCH_CLEAR_SIDE_IDENTITY_SOURCE_FROZEN=1 node test/sketch-clear-side-identity-browser.mjs /tmp/cad-clear-fixed
SKETCH_CLEAR_BAND_SOURCE_FROZEN=1 node test/sketch-clear-band-refusal-browser.mjs /tmp/cad-clear-band
D1066_SOURCE_FROZEN=1 node test/sketch-clear-draft-history-browser.mjs /tmp/cad-clear-regression
pnpm run build
```

The primary driver's `--baseline` observes the old behavior rather than asserting the fixed refusal. Band `--undo-baseline` observes Rectangle Undo availability without Finish. Original-source switching requires an isolated worktree or verified own-file backups and automatic restoration. No general kernel, whole-CAD, manufacturing, Physics, migration or release qualification follows. All existing HOLDs and the doc-sync pause remain.
