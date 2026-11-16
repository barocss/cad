# Constant circular Fillet resize persistence (#20 partial)

Reproduced on post-refactor main7bc88542: R2 on one front-top edge of a40×30×10 rectangle extrusion accepts Width60 with correct native geometry, but preserves the old length40 signature. Native JSON reopen holds the Fillet. `/tmp/cad-constant-fillet-before` is a passing diagnostic of this pre-fix failure, not acceptance.

The existing rectangleFinishResize proof now also admits a constant circular Fillet: radii must be undefined, radius finite positive numeric, exactly one unmerged native straight edge, terminal feature in the same plain three-node rectangle/extrusion document. Shaped sections, bound values, null/empty/object radii, multi-edge, held/rematched/suppressed features and arbitrary upstream changes remain excluded. Complete8-corner/12-edge/6-face semantic/native incidence proof and exact existing signature match are unchanged. Only varying Fillet needs endpoint radius assignment; that guard is unchanged. Constant Fillet refreshes only its saved signature, not radius, edge name or geometry parameters.

No App/prop surface was added: the existing extracted History admission owner calls the same proof. Kernel, matching tolerance, explicit candidate choices and HOLD scopes remain unchanged. #20 stays open for broader linked-inset/topology-changing and feature-family requirements.

## Verification

- Focused7/7, target lint, Studio tsc, diff --check PASS. Native tests prove constant signature-only refresh and volume, unchanged nodes/radius, malformed/shaped/bound/multi-edge rejection, stale signatures and corrupted native topology. Prior varying and Chamfer tests remain included. Independent read review found no blocker.
- Frozen actual Studio `/tmp/cad-constant-fillet-fixed` PASS: Width40→60, Undo/Redo, native JSON reopen without References hold; Depth30→36/reopen; Width60→20 shrink/reopen; invalid Depth1 refusal retains the accepted document. Reviewed `04-reopened.png`.
- Independent Python quarter-circle removal V=W×D×H−W×R²(1−π/4), native strict B-rep, both endpoint contact positions and45° native surface midpoint verify circular shape/placement as well as volume. Expected volumes11965.663706143592,17948.49555921539,21548.49555921539,7182.831853071796mm³; native/worker residual less than2.2e-11mm³. Point tolerance1e-7mm, unchanged shape tolerances.
- Production build4.17s PASS. No repeated broad suites, physical file downloads or remote-CI success claim. Existing #126 eight-file WIP preserved. Native JSON Open tests in-memory serialized document, not a physical Save download.

From Studio under the heavy gate with standard PW_DIR/CHROME: `RECTANGLE_CONSTANT_FILLET_FROZEN=1 node test/rectangle-constant-fillet-resize-browser.mjs <output>` and `node scripts/test.mjs rectangle-finish-resize`. `--before-fix` reproduces the baseline failure on7bc88542 only.
