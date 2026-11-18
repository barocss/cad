# #693: limited Fillet Section history editing

## Contract

For an ordinary base part consisting only of a numeric axis-aligned rectangle, undrafted positive numeric extrusion, and a terminal numeric constant-radius Fillet on one individually signed original edge, History now offers Circular / Conic. Conic starts at rho 0.5; returning Circular removes the section property. Radius, edge identity and its signature are preserved. Apply a section change separately from Radius. This is not G2 support expansion, general downstream topology rematching, multi-edge, varying-radius, bound-radius or arbitrary-source editing.

Before evaluating a family transition, the current worker must prove the full original native box topology and the exact individual straight-edge signature. The owner, scope, document, worker, open generation, evaluated state, freshness, busy/marker/variant boundaries and response revision are rechecked across both awaits. Failure or stale ownership cannot commit. Existing Conic rho / G2 tension edits retain their original path. HUD does not expose or accept this History-only choice. No schema or kernel change; existing HOLDs remain.

## Actual Chrome evidence

- Baseline: real UI creates a signed Circular R4 Fillet on 40 x 30 x 10 stock; History exposes read-only Circular, no section selector. Save/fresh Open succeeds.
- Fixed: Circular -> Conic rho .5 -> rho .4 -> Circular; Undo/Redo, Cancel, Save/fresh Open at both families. Radius 11 native failure preserves the original; recovery to 4 succeeds. Invalid rho 0/1 cannot apply.
- Four actual worker result-delivery holds: prefix Cancel, prefix New document, full-result Cancel, full-result Open. Original/new document and history remain correct; after release readiness and native geometry are checked. The selector screenshot is an unapplied draft awaiting prefix proof, not proof of changed geometry.
- Native geometry independently distinguishes Circular (volume 11862.654824574367 mm3), Conic .5 (11893.333333333352), and Conic .4 (11857.31022054957). Original edge/contact points persist. Rational quadratic section samples use the actual native surface knot domain; independent Simpson 8192/4096 integration converges below 1e-9 area. Conic volume tolerance 5e-6 mm3 and section samples 1e-7 mm are fixed and justified independently, not widened to force a pass.
- Existing identity and input browser regressions pass, including Conic/G2, varying-radius and fresh Open at 1024/1440 viewport workflows.
- Local screenshots were visually inspected. Frozen source capsules matched after each successful run and cleanup; all contexts, browser and server closed, zero page/console errors.

## Retained unsuccessful attempt

`fixed-01` timed out only when the fixture demanded massReady while deliberately withholding the full evaluation result. Document/history were preserved; displayed original body had pending mass and no volume. The harness lets mass events pass while holding the result, changing normal delivery order. Only that held-state assertion was changed to exact document comparison. Pre-hold readiness and post-release readiness/native checks remain. Product code was unchanged for `fixed-02`, which passed all four holds. This is not evidence of a geometry failure or of the exact cause of the pending original mass. Later batch stages in attempt 01 were NOT_RUN, not passes.

## Checks

- Focused Model tests: 11/11 PASS.
- Focused Studio tests: 77/77 PASS, including the original tracked section-history tests unchanged.
- Scoped ESLint and diff check PASS.
- Actual baseline, fixed-02, existing identity and input browser regressions PASS (see verification.json).
- Full repository suite NOT_RUN. Type/build and exact integrated CI are reported in the issue completion record.

Only synthetic fixtures and task-specific evidence are included. General doc-sync remains paused.

Final frozen batch: Model `tsc --noEmit` PASS; Studio `tsc --noEmit && vite build` PASS (10.59 s build, existing bundler warnings). Disk reserve stayed above 2 GiB: approximately 18.0 GiB at start and 16.9 GiB at completion. Latest remote remained 8af077eb0 before integration; focused Model 11/11 and Studio 77/77 reran successfully on the final state.
