# D1338 — Empty STL/3MF export admission (#138)

## Implementation

STL preflights every included root mesh and each prepared binary payload (including split lumps and kernel tessellation) before any download. One empty member stops the whole batch and source sidecar, with no silent omission. Existing quality and hidden-root scopes remain unchanged.

3MF rejects empty visible bodies by name, and empty input or post-weld objects before ZIP creation. Hidden filtering remains unchanged. Triangle predicates are dependency-free; body-aware recovery is separate. Explicit Scale body references get History/Factor guidance; unknown origins get generic repair guidance. Open triangle surfaces remain supported. Generic kernel STL and manifold/manufacturing policies are unchanged.

## Verification

- Model 8/8 (`empty-export`, `threemf`) PASS: empty/mixed and post-weld collapse, open triangle, hidden filtering, Scale attribution, offset STL buffer/count checks and existing archive/readback coverage.
- Actual hook 19/19 PASS: controlled evaluated empty/mixed meshes stop downloads/success; later empty kernel STL stops earlier files and sidecar; open sheet recovery and async ownership tests remain green. Hook quality is Automatic; guards are common to quality branches.
- Model/Studio tsc, changed-source ESLint, diff check and Studio build PASS. Existing bundler warnings remain.
- Source-frozen Chrome/WebGPU 1024/1440: failed legacy Scale downloads neither STL nor 3MF. History repair to0.005 restores all four STL qualities (Automatic/8/16/32), each684bytes/12triangles, and actual3MF XML1object/8vertices/12triangles. Exports preserve document.
- Actual1024 blocked-STL/restored-3MF screenshots reviewed. Receipt SHA256 `75380bbdeb8cd451e901e9d005539eab2fe1514d4d5352bcdebac3a46f266639`; no page errors/source changes.

## Limits

D1337 already prevents the former empty Scale result. Browser qualifies stale-result blocking/recovery downloads; controlled actual-hook/writer tests qualify empty evaluated results and mixed-batch atomicity, not injected browser geometry. Legitimate empty Boolean outputs are already omitted and cannot substitute for those tests. General malformed meshes, external slicers, assistive technology, full suite, CI and manufacturing readiness are not claimed. #139 STEP remains separate. Existing HOLD unchanged.
