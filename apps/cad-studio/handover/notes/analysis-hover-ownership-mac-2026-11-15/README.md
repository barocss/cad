# D1395 — analysis hover ownership

## Scope

Resolves #605. A map hover sample belongs to the current displayed document, evaluation, map result, visibility, backend and display pose/clip. A new ownership epoch clears the value during render; returning to a previous owner does not restore a sample. Retired callbacks cannot replace or clear a newer sample. Finite zero remains a valid Access sample.

Pointer leave, pointer down, wheel, fit, named view and projection changes clear the sample. The renderer checks the expected map reference before sampling, so an old map awaiting replacement cannot supply a new owner. Scalar computation, legend ranges, GPU Access cancellation, document geometry and manufacturing scope are unchanged.

## Verification

- Final focused tests: 20/20 PASS. Includes ownership/epoch transitions, queued stale callbacks, pointer early-return branches, map-reference sampling readiness, controlled asynchronous replies through the existing GPU Access hook, and retained scalar-map/selection tests.
- Targeted lint: no errors; the existing gpuRenderer console warning remains. Existing unrelated App unused `_k` is not changed and full App lint is not claimed.
- Final Studio TypeScript and production Vite build PASS; diff check PASS.
- Actual Chrome WebGPU at 1024×800 and 1440×900: observed Tall 5.33 mm clears on leave; one/all hidden bodies clear; restored Short fresh hover gives 6.00 mm. Keyboard Undo/Redo with stationary pointer independently clears samples.
- Normal file-input Open of a same-ID document while the pointer stays stationary clears old 6.00 before a fresh Short hover gives 3.00 mm. Preview None and map changes also clear samples. Real Access switching, hide and Undo pass; controlled async replies are unit coverage, not a forced GPU-delay browser claim.
- Six hover/leave/all-hidden/new-document screenshots reviewed. Final run has no source changes or console/page errors; owned contexts/browser/server closed.

## Evidence and limits

Final browser: `/tmp/d1310-publish.1Wqzsz/d1395-third`; receipt SHA256 `1ee9359aaa7f1eadaeb415a36f3bba0634bfc65dcaf9bf9088e5ebf26ca91c86`.
Build log: `/tmp/d1310-publish.1Wqzsz/d1395-build.log`.
The first browser run stopped on test setup order: turning Zebra off before enabling Thickness exits Analysis. The driver order was corrected. The second run saw a concurrent test-only type correction and is NOT qualification; its evidence is retained. Final third run alone qualifies the frozen browser scope.
Two intermediate TypeScript failures were test-only cleanup-variable assignment/narrowing errors; a typed lifecycle holder corrected them, followed by a passing full Studio typecheck. No product change was needed for these failures.
Tall values are observed map samples, not a physical wall-thickness oracle. The unchanged legend uses the first map range; no all-body normalized-scale claim is made. No exhaustive asynchronous, cross-browser, assistive-technology, manufacturing or whole-CAD qualification. Section map provenance remains the separate #606 follow-up. Existing HOLDs remain unchanged.
