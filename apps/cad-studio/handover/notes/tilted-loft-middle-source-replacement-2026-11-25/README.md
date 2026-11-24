# D1949 — Replace the tilted Loft middle source in History

P5 [row 7](../../roadmap-rows/07.md), [row 8](../../roadmap-rows/08.md) and [row 12](../../roadmap-rows/12.md). [#174 PART-05](https://github.com/barocss/cad/issues/174). Base `199eb929d27d9577781e5585c76d97348f3514aa`. Model and Studio feature change.

History can replace a plain rectangular middle profile on the same exact saved frame in the three-section ruled two-guide Loft. The original source sketches, copied guides, section frames, middle copy ID and the remaining History nodes stay intact. A parameter-driven replacement size is copied as its numeric value. The existing kernel verifies contact and makes the refusal atomic.

- **FAIL, previous Studio.** The accepted tilted Loft has no middle source field even with a matching alternate source.
- **PASS, actual desktop Studio.** The middle source field omits a sketch at a different station. A same-frame rectangle that misses one rail refuses and keeps the accepted document. Reset and a valid replacement change only the middle copy and the source reference. Undo, Redo, Save and fresh Open pass. The horizontal desktop control passes.
- **PASS, independent geometry.** The accepted middle depth changes from 12 to 14 mm. The integral changes from 16808/7 to 2656 mm³. Native and worker values agree within 1e-8 mm³. The final solid retains 10 faces, 20 edges, one shared four-edge ring, four exact native rail spans and all 40 pcurves after reopen.
- **PASS, affected checks.** 39 Model and two Studio checks. The Model regression includes a moved source, a shared copy and a numeric parameter snapshot. Model types, production build, scoped ESLint and diff check pass.
- **NOT_RUN.** STEP, other projected frames, end-section replacement and full local suites. #174 remains open. First mechanical CAD remains 8/10. Overall progress remains unmeasured.

```sh
THREE_SECTION_TWO_GUIDE_SOURCE_FROZEN=1 node apps/cad-studio/test/three-section-two-guide-loft-browser.mjs "$OUT/baseline" --replace-baseline
THREE_SECTION_TWO_GUIDE_SOURCE_FROZEN=1 node apps/cad-studio/test/three-section-two-guide-loft-browser.mjs "$OUT/studio" --replace-tilted
THREE_SECTION_TWO_GUIDE_SOURCE_FROZEN=1 node apps/cad-studio/test/three-section-two-guide-loft-browser.mjs "$OUT/horizontal"
node packages/barocss-cad-model/scripts/test.mjs loft-guide loft-section-history-edit api-multi-conic-loft loft-legacy-label
node apps/cad-studio/scripts/test.mjs loft-two-guide-feedback
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

Evidence files stay outside Git.
