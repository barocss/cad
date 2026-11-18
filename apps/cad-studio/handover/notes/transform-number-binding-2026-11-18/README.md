# #698: number-only transform History fields

## Verified defect and bounded repair

Rotate Angle and Scale Factor are plain numbers in both the Model document and native feature contract. Native Rotate requires a finite number of degrees (absolute value at most 3600); Scale requires a positive numeric factor at most 1000. Both pivot coordinates accept Dim references. History's generic binder incorrectly offered parameter selection for the scalar fields, produced parameter objects, and passed them to the native evaluator without numeric resolution.

Actual baseline: each scalar parameter selector was present and Apply enabled. Selecting and applying Angle/Factor was refused; accepted document, history, native shape and mass were preserved. This was an unusable offered action, **not observed data loss**. Both normal numeric edits and Pivot X parameter binding succeeded, including Undo/Redo and Save/fresh Open.

The only product change excludes Rotate `deg` and Scale `k` from binder wrapping. Numeric fields, all Pivot binders, document schema, native semantics and original refusal behavior remain unchanged. This does not add parameter support for angles/factors, change directed-expression contracts or lift any HOLD. General doc-sync remains paused.

## Actual regression evidence

Fixed Chrome checks both transforms separately:
- No Angle/Factor parameter selector; Pivot X/Y/Z selectors remain.
- Rotate 90→120 degrees; Scale 2→1.25, exact document changes and Undo/Redo.
- Invalid 3601-degree/1001-factor input: acceptance is refused, original document/history/native geometry preserved; a valid draft can be restored and canceled.
- Pivot X bound to value 3, Undo/Redo, then a later numeric Rotate90/Scale2 edit retaining the binding, Save/fresh Open, re-editing controls.
- Independent literal eight-corner transforms and native strict geometry: rotation about pivot and uniform scale, expected volume 12000 for rotation and `12000*factor^3` for scaling. Vertex tolerance 1e-7 mm, volume 1e-6 mm3. No screenshot-derived geometry claim.
- Existing Revolve and Pipe angle-binding actual regressions PASS, retaining their supported profile/run/radius bindings.

All successful actual runs retained frozen sources and cleaned their contexts/browser/server, with no page/console errors. Three screenshots were visually inspected locally. Public rendering and exact CI are recorded in the issue.

## Tests and limits

Original focused unit tests: 7 PASS / 2 RED, specifically unsupported scalar bind/param exposure. Earlier test-only manual-node fixtures also failed file equality because the reader normalized outputs/nextId; corrected to normal `withNode` construction before the retained result. No product inference was made from fixture normalization.

After repair: Transform/Revolve/Pipe focused Model 17/17 PASS. Tests cover malformed scalar object native INPUT refusal, immutable numeric setters, independent mass/centroid, Pivot XYZ bindings and parameter changes against literal native results, container roundtrip, Width/Height parameter regression. Scoped lint and diff/syntax checks PASS. Final types/build and exact CI are recorded separately. Full repository suite NOT_RUN.

The first final Model type check failed after all three actual browser runs passed: this task's new test had an inferred `node` type error, and the integrated #696 drawing test widened `auto:true` to boolean. The transform test was corrected with explicit `StudioDoc`/`ModelNode` annotations only; product/actual driver stayed unchanged and focused17/17 reran successfully. The unrelated drawing test was returned to its owner for correction. Studio type/build was NOT_RUN after that failed Model check; subsequent integrated results are recorded separately.

Final integration includes #697 `c4674eb29` and #696 test correction `f571db8b7`. Model tsc and Studio tsc/Vite build PASS (7.37 s build, existing bundler warnings); final focused Transform/Revolve/Pipe plus corrected drawing test19/19 PASS. Final heavy disk reserve started13.9 GiB and ended10.2 GiB, remaining above the2 GiB stop floor. No other owner files were modified by this task.
