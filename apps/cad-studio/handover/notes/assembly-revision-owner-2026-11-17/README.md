# Revision file request lifetime

Base `b92863808`. A revision file read now belongs to the exact accepted document, selected inspector and latest file request. Newer selection (even an invalid file), document/selection/blocking changes and unmount retire older requests. This is logical cancellation; the underlying File read may finish but cannot publish a result or error. Current reads still use normal offer/Accept/Keep. Held-look notices only follow successful commit; current read exceptions are handled.

## Actual reproduction and correction

The initial data-loss hypothesis was disproved: after position X0→17, a delayed file result did **not** overwrite X17, because App already guards stale accepted-document callbacks. No new geometry-overwrite fix is claimed.

Two actual gaps were reproduced: selection away/back leaves a prior read live; more importantly, a newer invalid file shows its read error but the older slow file then registers pending E. `before.png` shows both the current error and the obsolete pending offer. This can make the user act on a superseded file. The fix adds request generations plus document/selection checks before publishing, modeled after existing local ownership guards. No changes to model revision ordering, native schema, saved geometry or source identity.

## Verification

- Actual Chrome baseline1 FAIL at selection roundtrip, baseline2 FAIL after newer invalid file. File.arrayBuffer calls the real native method first and delays only delivery of the genuine bytes. Parser and Worker results are not fabricated; no retained React callbacks are injected.
- Fixed browser PASS: accepted placement retained; latest invalid file does not revive older E; selection away/back retires read; newer valid F wins; valid stale result cannot restore a replacement document with same IDs; stale invalid file cannot publish its error there; current E offers/accepts and Undo/Redo/fresh native Save/Open stay functional.
- First fixed run reached the stale-error assertion but the test had not dismissed its earlier legitimate invalid-file toast. Explicitly dismissing that expected notice before the subsequent cases corrected the test; no second product change. Final whole run PASS.
- Studio type check, focused ESLint/diff checks, syntax check PASS. Adjacent instance-notes-linked-revision tests 3/3 PASS (controlled storage/definition behavior, not browser attribution).
- Screen review: guarded state retains current invalid error but no obsolete pending offer. Reopen retains replacement document name, X25 and shared E. Synthetic drilled plates only; geometry accuracy and interference not newly qualified.
- Frozen source before/after/cleanup unchanged during final browser run.

Reproduce from root with Node22:

```
node apps/cad-studio/scripts/test.mjs instance-notes-linked-revision
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
node node_modules/eslint/bin/eslint.js apps/cad-studio/src/ui/InstanceInspector.tsx
ASSEMBLY_REVISION_OWNER_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/assembly-revision-owner-browser.mjs <fresh output>
```

No external project watcher, compressed-container timing, nested/mated assembly or neutral export qualification. Existing App stale-document guard remains the final authority. #178 remains open; existing HOLDs unchanged.
