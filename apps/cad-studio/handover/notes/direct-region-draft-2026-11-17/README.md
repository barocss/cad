# Direct REGION: visible finite drafts own extraction

Bounded #29 correction, not whole-issue completion. Four REGION inputs now use the existing raw surface draft owner (exact direct identity, object ID and domain). A blank or nonfinite value disables Extract region and explains the error. Direct handler invocation also refuses scheduling. Finite values are passed unchanged: ordering, supported interval/domain and trimmed/untrimmed admission remain with the original producer. No clamp, sorting, automatic correction, new geometry support, native refit or tolerance changes.

## Actual evidence

- `/tmp/cad-region-draft-before-01`: first baseline diagnostic PASS. Typing valid u to=4, then blank, left Extract region enabled and created the previous [2,4] × [-1,3] region. This is defect reproduction, not successful-product acceptance.
- `/tmp/cad-region-draft-after-01`: first fixed actual PASS. The same blank is blocked with unchanged Doc. Explicitly typing 4 creates the expected region; original sources, nodes and outputs remain exact. Undo restores the original exact document and input domain end 5; Redo restores the extracted exact document and end 4.
- Successful extraction and external direct-owner changes intentionally reset these drafts to the current surface domain. Unlike the prior numeric box state, uncommitted values do not survive owner replacement. This is a deliberate input-lifetime policy.

The original D347 affine fixture is included as `fixture.bcad`. The independent Python source parser verifies only four emitted control-point corners: [7,-11,13], [7,-11,21], [13,-3,13], [13,-3,21], within 1e-7 mm. This does not claim new general region/native/refit accuracy. Existing source and geometry evidence remains separate.

The oracle artifact retains its historical `retained-four` filename; in the final run 4 was explicitly re-entered after the blank was blocked. Likewise runtime screenshot 02 was named `blank-created`; the published `after-02-explicit-four.png` correctly describes the final action. No result was relabeled from FAIL to PASS.

527 sources frozen; runtime errors/console errors/changes empty. Context/browser/server cleanup completed before freeze release. Curated receipts include original receipt hashes and frozen source hashes. Original full artifacts remain in the paths above.

## Verification

- First focused run 5/6: new test mistakenly used the existing SurfaceParameter-only locator for a raw REGION Input. Local test locator corrected, product unchanged.
- Final focused 6/6 (new 1 + adjacent 5), all four inputs checked for blank/whitespace/NaN/±Infinity, directly invoked handler blocked, direct/ID owner reset. Finite 0/-1/99 scheduling is tested, not producer success.
- Studio TypeScript, targeted lint and driver syntax PASS. Production build 6.60s PASS. Exact logs included as focused.txt, focused2.txt, tsc.txt, lint.txt and build.txt (text extension avoids ignored log files).
- Actual PNGs inspected by the implementation agent (root also reviewed final 01, 02 and 03): baseline blank/enabled, final blank/explanation/disabled, explicit 4 result and domain. Synthetic fixture; no personal data.

Save/Open, new trimmed-surface acceptance and broad #29 completion are not newly claimed. Shared NumberField, CurveTools At-t/Split, Model/kernel and all WIP/HOLD scopes are untouched. #29 remains OPEN.
