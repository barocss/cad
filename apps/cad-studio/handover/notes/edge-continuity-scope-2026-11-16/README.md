# Edge continuity selection scope (#116, partial)

Base: `64bd8ba462c7f1d86aeec4e0bb70df0cd081f437`.

## Bounded change

When a selected display edge has no unique `nativeJoint`, explain before inspection that the action browses the body's native joints rather than identifying that display edge. Once populated, the native-edge list explicitly owns the measurement and does not claim to move viewport selection. An empty native-joint list now gives a short different-native-solid recovery instruction, without leaving a disabled Measure button. Keyboard inspection moves focus from the removed button to that result; pointer inspection does not steal focus.

Only App's selection-kind prop and the existing EdgeContinuity component change. No native topology mapping, selected geometry, Worker request, measurement computation, document, history or serialization change.

## Verification

- Related tests (`edge-continuity-scope`, `continuity-angle-label`, `step-continuity-help`): **6/6 PASS**.
- Studio TypeScript and production Vite build: **PASS** (build 4.60s, existing warnings).
- Component/test ESLint and diff whitespace: **PASS**. Full changed-file lint is **NOT CLEAN**: App.tsx line 2433 has existing unused `_k`; linting the exact base App through stdin reproduces the same error. That unrelated code was not changed.
- Actual desktop Chrome WebGPU, **1024×800 and 1440×900 PASS** using `CONTINUITY_SCOPE_FROZEN=1 node test/edge-continuity-scope-browser.mjs <output>` with existing Playwright/Chrome paths. Circle R4 extruded 6: select top displayed rim, see pre-inspection mapping warning, inspect whole-body list with initially empty choice, choose a native edge and measure. Replace with closed faceted tetrahedron: keyboard inspection produces empty recovery result with focused text and no Measure/select controls. Both authored documents and clean state remain unchanged. No runtime/console errors; frozen-source changes empty. Screenshots of narrow circle and wide empty-mesh states visually reviewed.
- Independent read-only review found no concrete blocker.

Harness history: first launch used the wrong working-directory-relative path. First browser attempt was invalidated by an in-flight source edit/HMR and is not evidence. Next stable run reached the circle successfully but failed exact document comparison because the mesh fixture omitted the output that Open normalizes to `b0`. The fixture now explicitly declares `b0`; final frozen run passed both widths.

## Remaining acceptance

#116 remains OPEN. Candidate native segments still need actual viewport location highlighting, including tangent/G2 segments omitted from ordinary display edges. This notice does not complete that criterion. General STEP, hidden-body, assembly and assistive-technology coverage are NOT_RUN. Save/Undo semantics were not exercised by this read-only inspection change.

The original #126 uncommitted work and all HOLDs were preserved. No hosted CI success is claimed.
