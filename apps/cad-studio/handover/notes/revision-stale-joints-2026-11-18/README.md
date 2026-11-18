# #686: explicit stale occurrence-pose recovery after revision

Baseline 6f0cdb062: posed hinge occurrence accepts a normal plate revision B. Stored base~lid value 0.523598775598 remains intentionally, but InstanceInspector hides the entire joints group, including the existing diagnostic and Reset. Actual New revision/Accept Chrome baseline rendered the plate and failed group count 0 vs 1.

Fix only admits existing InstanceJointsControls when stored joints remain, even if the current definition holds no parts. It never deletes values automatically. Existing pattern gating and core reset semantics remain intact.

Focused 7/7 (core revision/reset immutability, actual Inspector composition, hinge/plain/pattern controls), lint, Studio TypeScript and independent review pass. Frozen Chrome validates original hinge controls, New revision/Accept, explicit Reset changes only joints, Undo/Redo and exact native Save/Open. Accepted and Reset screenshots show the same new plate with and without recovery controls. Reopened image rendered but framing crops at right; no viewport fix is claimed and it is not used as visual evidence. Two contexts/browser/server closed, no source change during run.
