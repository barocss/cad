# #652: assembly add route admission

Base: `5c66cdd3f`. Source: `assembly/edit.ts` addPart/partCopy. Existing #649 revision fix remains unchanged.

## Actual baseline
A valid root linked route was accepted as a child by addPart, but the returned document could not be encoded (nested route bundles unsupported). The actual dispatcher with evaluatePart returned changed=true/isError=false/ok=true for copy_of=base. Two failing baseline tests are recorded in baseline-summary.json. **Studio mergeTurn already blocks final application. No UI document corruption is claimed.**

## Change and contract
Validate only the incoming child against existing route admission before add/copy. VALUE uses the existing dispatcher refusal channel. Keep original root data unchanged, never silently detach, and retain normal/explicitly detached copies and ordinary parts added to a linked root. Deep children and pending candidates are checked by the existing admission contract.

## Verification
- Model focused/regression 37/37 PASS: assembly-add-route-admission, assembly-revision-admission, api-assembly.test, route-bundle-admission.
- Model tsc and scoped ESLint PASS.
- Actual Chrome first consumer run PASS, unchanged frozen source capsule. The inspector runs the actual dispatcher, not an independent geometry oracle.
- Rejected linked root is byte-semantically unchanged and opens/saves/reopens. Ordinary and explicitly detached dispatcher-created copies open in Studio, Reset placement, Undo/Redo, Save/fresh Open; all accepted document comparisons pass.
- Screenshots reviewed: ordinary-opened shows original and translated copy; detached-final shows native reopened geometry with the reset copy coincident at the origin. This is not a general assembly or route qualification.
- Existing PDF golden/Workspace lint limits are unrelated and not rerun or reclassified.

Commands: `node packages/barocss-cad-model/scripts/test.mjs assembly-add-route-admission assembly-revision-admission api-assembly.test route-bundle-admission`; `ASSEMBLY_ADD_ROUTE_ADMISSION_FROZEN=1 node apps/cad-studio/test/assembly-add-route-admission-browser.mjs <fresh-output>` with the installed Chrome/PW_DIR configuration.
