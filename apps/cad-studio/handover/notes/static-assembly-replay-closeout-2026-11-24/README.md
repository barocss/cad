# D1837 — Retire duplicate static assembly replay research

P3, row [10](../../roadmap-rows/10.md), [#737](https://github.com/barocss/cad/issues/737). Base `eb9ca0ab8198308b3cd324fd10b0daabf34fd598`. Reuse the existing actual [#207 workflow](../assembly-step-document-view-2026-11-20/README.md).

- **PASS, desktop Studio WebGPU.** Use one assembly with two repeated blocks, Post and Cap. Author three steps, their views and the explode setting. Reach the saved Post step with Next, direct jump and return from Cap. In each submitted frame, Blocks 1 and 2 and Post are visible, only Post is highlighted, and Cap is absent. The ordered surface and edge transform matrices and material state are identical across routes. The eye is approximately `[147.9235, -147.6274, 165.4745]` mm and the target is `[38.0745, 25.4669, 16.5271]` mm. With two Next actions and a direct jump, Cap also reaches the same state and captured camera. The ordinary Post-step selection control distinguishes user selection from the step highlight.
- **PASS, exact file and history.** The two native Save files before and after navigation have identical bytes and SHA-256 `04f1de72be0b92549f34d61a02246180de6be11d0f23802b87d73e7a941ab92a`. The original base, instance records and mates field compare equal. The fixture has no mates. Undo and Redo keep their existing entries and apply the expected model states.
- **PASS, affected checks.** 34 focused Studio tests and Git diff check. The desktop run gives 21 screenshots and three independent Python checks, with 664 frozen files and zero page, console or source changes.
- **FAIL.** None observed in the selected replay.
- **NOT_RUN.** Nested assembly, mate behavior, dynamics, other backends, pixel equality, mobile and full local suites. The requested static replay check is already part of #207. The broader #207 feature scope remains open. First mechanical CAD remains 8/10 accepted. Whole-product completion is unmeasured.

```sh
ASSEMBLY_STEPS_SOURCE_FROZEN=1 node apps/cad-studio/test/assembly-steps-browser.mjs "$OUT/studio"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test assembly-steps assembly-step-member-selection assembly-step-takeout-selection step-explode-draft
git diff --check
```
