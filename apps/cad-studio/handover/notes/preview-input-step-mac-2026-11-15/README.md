# D1393 — preview numeric input step consistency

Completes #603, including its Clearance Near comment scope. Print layer height and Clearance Near already accept any finite positive number. Their HTML attributes now use `step="any"` and `min={Number.MIN_VALUE}` rather than incompatible grids based at0.001. Only these two product lines change. Controlled values, finite-positive callbacks, application validation and draft behavior remain unchanged; #604 blank draft behavior stays separate.

## Sources and verification

- `src/viewport/PrintPanel.tsx`, `src/viewport/ClearancePanel.tsx`: two input-attribute changes.
- `test/analysis-number-constraints.test.ts`: props/SSR and unchanged callbacks for .2/.3/.35/.301/.0001/13.9/14/20/MIN/MAX, invalidzero/negative/nonfinite rejection, Print precision/toggledefaults.
- `test/preview-number-validity-browser.mjs`: actual native validity and current calculations.

Node22.19.0: 9/9 focused tests including adjacent Print partial/source/open regressions, targeted ESLint, Studio TypeScript and production build PASS.

Actual Chrome first run PASS at1024×800 and1440×900. Both inputs accept .2/.3/.35/.301/.0001 with valid=true, stepMismatch=false and rangeUnderflow=false; current worker values match exactly after blur/refocus. Clearance14 includes the independently constructed14mm-gap pair;13.9 excludes it. Actual ArrowUp/ArrowDown and physical spinner clicks consistently observed .3→1.3→.3, not the old .05/.1 step grid. This records Chrome behavior, not a promised cross-browser increment. Print Undo/Redo and Save/fresh Open retain .35 exactly. Clearance Near edits leave the document unchanged and fresh Open resets to its existing ephemeral default1; persistence is not claimed. Detached same-attribute zero/negative probes only verify native constraints, not invalid editing behavior. Four small-value screenshots reviewed, with no source/runtime errors and clean shutdown.

Receipt `d1393-first/receipt.json` SHA256 `fb8641c2732abf68d13c80c2977c07c97d490a8e7c262393b4a938aaf4fcb0c4`; local evidence retained outside the repository.

Very small Print Z/Top still round to0.000 in the existing display; exact worker values were checked independently. MIN/MAX tests cover callbacks/contracts, not successful extreme-size Print computation. #604, assistive technology and other browsers NOT_RUN. No native geometry, manufacturing or numerical admission change. Existing unrelated App lint and aggregate docs drift remain separate; no full-suite claim.
