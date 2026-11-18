# #708 — nested assembly public meshes

Baseline: 7568ddd59. Public Assembly.addPart creates a subassembly whose own nodes are empty and whose child is a 10 × 10 × 20 mm pin. After actual Studio Native Open, the pin is visibly present at x=30, but Assembly.meshes on that same opened document returns []. placedDoc evaluates one body with bounds [30,0,0]–[40,10,20], volume 2000 mm³. The original document remains unchanged.

The fix removes only the premature own-node filter. Existing placedDoc flattening and hidden-host exclusion remain. Public meshes now returns p1/b2 with 24 vertices, minimum x=30. Actual Save and fresh Open preserve the exact result and visible pin. These screenshots compare Studio visibility, not a Studio-rendering defect or a before/after visual change. Appearance override behavior is not changed or qualified here.

Verification: focused plus existing api-assembly 9/9; actual frozen Chrome baseline expected FAIL (0 !== 1), fixed PASS; source changes=[] and owned browser/server/context cleanup confirmed. Model/Studio type checks and owned-file lint recorded in the issue after completion. Regressions cover deeper placement, hidden host/child, empty part, explode, original/mesh immutability and internal cuts. No schema or document mutation.
