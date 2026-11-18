# #721: ambiguous nested mate names

Base: 949e666607fb2482b0e5fc802c0154ef73e03927. Nested public mate path resolution is separate from #719's direct name-only lookup.

## Actual baseline and fix

A subassembly contains Pin at z0, authored Pin 2 at z30, and a generated pattern occurrence also called Pin 2. A top-level distance-5 mate from the base top to `Sub/Pin 2` silently stores `p1/pat1-1` and moves Sub to **z=+15**. The explicit path `p1/p2` stores the intended authored part and moves Sub to **z=-15**. Both report no solve problems. Original input is unchanged.

The baseline browser opens the API-returned wrong document in actual Studio: +15 is visible in the Inspector and viewport, then survives native Save/fresh Open. It fails on the expected missing ambiguity refusal.

The fix rejects duplicate names at each local path segment with `PART_AMBIGUOUS`, before creating a mate. The fixed browser verifies that error, then consumes the explicit-ID result: -15 is rendered, a normal host rename Undo/Redo preserves the mate, and native Save/fresh Open preserves its target. This does not automatically repair previously saved wrong mates or rename data. The fixed screenshot shows the explicit-ID positive control, not automatic retargeting.

Existing ID-versus-name `VALUE`, unique name/ID paths, whole names containing slash, and missing-path errors remain unchanged. Direct `idOf` behavior from #719 is untouched.

## Verification

- Frozen baseline expected FAIL; fixed Chrome PASS. Local screenshots directly inspected.
- Focused ambiguity plus existing nested-reference/API/pattern regression: **59/59 PASS**.
- Model TypeScript, Studio TypeScript, owned-file ESLint: **PASS**, exit 0.
- Both browser runs: source changes=[], all contexts/browser/server closed.
- Read-only independent review: no blockers.
- Public image byte equality and actual GitHub rendering are distinct checks; publication verification is recorded on the issue.
