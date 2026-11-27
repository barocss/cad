# D2108 — Extract Studio worker recovery from App

P4 [row 12](../../roadmap-rows/12.md) and [row 22](../../roadmap-rows/22.md) · Base `27525987c788b4877d644c756e40d66a51e0d623`.

The Studio worker recovery hook owns the slow-work timer, document work invalidation, retired-result cleanup, worker failure, Retry engine and Stop. App still applies the owned History entry from Stop. The App source falls from 2,447 to 2,418 lines. The lifecycle driver writes its Vite cache in the evidence directory.

## Verification

- **PASS, actual desktop Stop.** The driver delays delivery of genuine native Worker geometry and mass replies. Stop terminates the owning worker, retires its pending reply, reverses only the owned Box history entry and rebuilds the 4,000 mm³ stock. Redo recovers the 1,000 mm³ Box and Undo returns the stock. The five before/after states match for document, geometry facts, History, selection and notices.
- **PASS, actual desktop Retry and lifecycle.** A controlled error reaches the active native Worker handler. Retry creates one replacement worker and preserves the accepted document, Undo/Redo and the 792 mm³ result. Repeated mount and unmount terminate each owned worker exactly once. The eleven before/after states match for document, geometry facts, mount state and Worker lifetime. Both browser flows use actual Chrome WebGPU. The Stop runs freeze 693 and 694 files respectively. The retry flow checks that the owned source hashes match before and after. No page errors are observed.
- **PASS, affected checks.** All 82 Studio tests, Studio types, scoped ESLint, Studio production build and diff check pass on Node 22.19.0.
- **FAIL.** None observed in the selected baseline and candidate checks.
- **NOT_RUN.** Natural Worker crashes, StrictMode lifetime, mobile, full local suites and live providers. First mechanical CAD is 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Run once on the baseline and once on the candidate, using the heavy gate.
D1897_SOURCE_FROZEN=1 node apps/cad-studio/test/model-evaluation-stop-browser.mjs "$OUT/stop"
A06_ARTIFACT_DIR="$OUT/retry" node --test apps/cad-studio/test/engine-client-lifecycle-browser.mjs
pnpm --dir apps/cad-studio test stop-work-ownership engine-client-lifecycle project-open-ownership document-file parameter-geometry
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
