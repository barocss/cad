# #69 Workspace sample admission

Existing issue #69 remains OPEN. Bounded desktop Joints/FK Workspace correction only; no Physics/Motion activation or new numerical accuracy/collision claim.

## Reproduction
Synthetic repository chain-2r document, two pre-solved instance placements, h=10, contact-free off. Actual Chrome UI and actual downloaded JSON: N=100.5 reported samples=100.5 while voxel counts totalled100 and excluded=0. Apart from samples, the map equalled N=100 (83voxels). N=6 was admitted despite UI min100. Baseline PASS means this failure reproduced, not product acceptance.

## Change
UI accepts integers100..200000 with step1 and an associated inline recovery message. Invalid edits do not replace the previous map/download. Both disabled state and action callback check numeric admission. Core retains small positive counts while refusing fractional, nonfinite, unsafe or nonpositive samples and nonfinite/nonpositive h with BAD_VALUES. No rounding, new schema or document edits. Existing helper N32 and core N10 NO_RANGE remain supported.

## Verified
- Model workspace input and existing workspace:8/8, including existing positive self-contact exclusions.
- Studio workspace panel:4/4; prior128 and normal200 remain valid.
- Actual Chrome:100 accepted;6/100.5/blank/200001 disabled with associated message and byte-identical retained JSON;128 and200 recover. Seven real downloads, not Blob interception.
- Contact-free200 actual map accounts for200 poses with excluded0. Positive-exclusion evidence is the separate existing model regression, not this UI fixture.
- Existing composition Chrome:200, live pose updates/home, map hiding/repeated mapping and document switch passed. Its legacy export check intercepts Blob content, unlike the seven new real downloads.
- Document, instance placements, displayed history and evaluated body key/volume/centroid unchanged. Hide checked through renderer-specific cloud/DOM condition.
- Model/Studio tsc and scoped lint passed. Cleanup receipts close context/browser/server; source changes and browser errors empty.

First new model test incorrectly compared JSON-normalized zero with signed -0. Fixture changed to check serialized accounting without claiming signed-zero preservation; final8/8 passed. Product calculation was not altered for this test correction.

## Limits
No full repository CI claim before exact pushed SHA checks. No max200000 performance test, screen-reader certification, forced-CPU matrix, hidden Undo-stack proof, stale-ready callback guarantee, or general Workspace numerical certification. Only synthetic repository fixtures/screenshots/files are published. Existing unrelated baseline failures and HOLDs are not reclassified.
