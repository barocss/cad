# #695: lossless terminal Fillet radius-mode history

## Scope and safety

A numeric axis-aligned rectangle, positive undrafted numeric Extrude and terminal single individually signed original edge Circular Fillet can change Constant to two equal positive endpoint radii. The reverse is offered only for exactly two equal positive numeric `atEnd` controls equal to the scalar radius. Unequal radii, interior controls, bindings, shaped sections, special sources and downstream operations are not converted. No endpoint value is silently discarded. To intentionally remove a varying design, first explicitly edit/apply equal endpoint values, then separately change mode. Existing creation End0 sentinel is not introduced into saved radii.

The UI enumerates exact box corners/12 edge candidates. Rounded source signatures locate a unique candidate only; they never reconstruct endpoint coordinates. Apply separately proves the whole original native topology, exact individual signature and the named edge's actual endpoints. Full-document equality against the expected setter output excludes simultaneous source/radius/metadata changes. Both native-prefix and full-evaluation awaits preserve document/scope/draft/open/worker/evaluated/revision ownership. Invalid geometry or stale work cannot replace the accepted model. HUD does not display or accept the History-only mode choice.

No kernel or schema changes. G2, broad topology, other HOLDs and doc-sync remain unchanged.

## Baseline and retained unsuccessful attempts

- Baseline02: actual UI created Constant R4, explicit Varying R4→R4 and R4→R2 on a 40×30×10 box. Existing History mode is read-only; native strict geometry and Save/fresh Open succeed for all three. Constant/equal share independent circular volume and contact points. Unequal native geometry is recorded, not claimed equal to scalar geometry.
- Baseline01: Constant completed, then the fixture incorrectly searched for `Radius` after entering Varying; actual label is `Start radius`. Failure occurred before Varying Apply. Fixture-only correction and new frozen run passed. Product unchanged.
- Fixed01: source preparation ENOENT before browser startup, because the fixture pinned the new Model helper under Studio/app. Corrected to Model/app; actual/regressions/type/build were NOT_RUN in that attempt.

## Fixed actual qualification

Fixed02 passes Constant→equal Varying, Undo/Redo, Save/fresh Open, existing End2 edit with mode conversion unavailable and explicit guidance, intentional End4 restore, inverse Cancel and Apply, exact original scalar document restoration and Save/fresh Open. Zero/oversized Radius refusal and recovery retain the accepted model. Section choice disappears for Varying and returns for Constant. Four real worker result-delivery holds (prefix Cancel/New and full Cancel/Open) verify accepted/new document and history preservation, then readiness and native geometry after release. Held-state screenshots show a draft awaiting proof, not committed geometry.

Independent volume for scalar/equal R4 is `12000 - 40*16*(1-pi/4)` = 11862.654824574367 mm3, tolerance 1e-7 mm3. Native contact points on the original endpoints are checked within 1e-8 mm. Unequal R4→R2 strict-native/readiness behavior is regression coverage, not a new general variable-law proof. Existing #693 actual Section transitions and existing Conic/G2 identity regressions qualify unrelated shaped/varying modes separately.

## Validation

Focused Model 14/14 and Studio 70/70 PASS; scoped ESLint and diff/syntax PASS. Type/build, final integration tests and exact CI are reported in the issue completion record. Full repository suite NOT_RUN. Source capsules and cleanup summaries accompany the retained synthetic evidence. Only task-specific notes are added; general doc-sync stays paused.

Final Model type check initially failed on four Dim-to-number assignments despite runtime finite checks. Added only `as number` narrowing after those checks. esbuild transformed JavaScript before/after is byte-identical (TYPE_ONLY_RUNTIME_IDENTICAL); Model 14/14 and Studio focused regressions rerun. Actual/browser receipts precede this type-only correction; no runtime behavior changed. Studio build was NOT_RUN after the initial type failure. Final type/build results are recorded separately.

Final type/build: Model `tsc --noEmit` PASS; Studio `tsc --noEmit && vite build` PASS (9.10 s build; existing bundler warnings). Final type/build disk reserve 15.1→14.3 GiB, above the conservative 2 GiB stop floor. Latest #696 main `9de29a074` was fast-forwarded before integration; unrelated drawing changes are preserved. Integrated focused Model including #696 and Studio tests rerun before normal push. Exact CI is linked in the issue.
