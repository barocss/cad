# D1390 — closed varying-Fillet perimeter recovery

Completes #502 at the tested desktop scope. Only the owned synchronous varying-Fillet open-chain refusal gets the new recovery, and only when the current selection proves one connected closed display-edge cycle. The existing failure notice says to switch to Edges and select an open chain, such as the arc without its closing edges. Individually picked edges also get the existing Edit picked edges recovery. Technical FILLET_CHAIN details remain in Kernel detail. No native admission, preview, radius or selection mutation.

## Sources and guards

- `src/state/closedFilletPerimeter.ts`: matches explicit-edge precedence and face-edge resolution, requires valid unique single-body references and one connected degree-2 graph. It uses the same coordinate-wise `Math.round(x*1e4)` grouping as the builder, not a geometry repair tolerance. It rejects ambiguous persistent names, missing/nonfinite inputs and tiny straight edges collapsed into one bucket; actual curved full-circle edges remain diagnosable.
- `src/state/commandBuildFailure.ts`: exact command, typed code and owned message gate; unrelated FILLET_CHAIN, disconnected/branched selection, other commands and Constant failures remain unchanged.
- `test/closed-fillet-perimeter.test.ts` and `test/closed-fillet-chain-recovery-browser.mjs`: focused diagnostic and actual lifecycle proof.

## Verification

Node22.19.0: 25/25 focused closed-perimeter/build-failure/fillet-family tests PASS, targeted ESLint, final Studio TypeScript and production build PASS. Independent read-only review checked topology, reference precedence and narrow refusal ownership. Initial typecheck caught a test-only invalid `GEOMETRY` CadModelCode; it was corrected to the unrelated valid `REFUSED` code, then focused tests/lint/typecheck/build reran successfully. Product code was unchanged from the actual-browser run.

Actual Chrome at 1024×800 and 1440×900 PASS: top-face and explicit-three-edge closed selections refuse with correct local guidance; Edges/open arc and Edit picked edges/removing two radials recover. Both radii 0.6/1.2 and document remain unchanged while correcting selection. Apply, Undo/Redo and native Save/fresh Open pass the existing independent native oracle. Native volume 500.45053080076445 mm³ versus independent 500.4505310301965 mm³ (absolute error 2.2943e-7 mm³), with identical native proof across six checks. Six refusal/recovery screenshots reviewed; guidance, radii, Apply and collapsed Kernel detail readable. No source changes or runtime errors; clean shutdown.

Final receipt `d1390-second/receipt.json` SHA256 `238e0a1b470069344de2f6ef3dc198dab5c51df8114b8397fa7fc0b928363c1d`. Initial receipt `d1390-first/receipt.json` SHA256 `41dd8249eea2280960b54b3ef4a42e180095278a2fc2f42893dd6e4098d07960` is preserved: valid preview normalized `.6` to `0.6`, defeating a raw-string test assertion. Only the driver switched to numeric equality; no product fix was needed. Evidence remains local outside the repository.

#503 Constant full-perimeter carrier-binding failure remains separate and open. Arbitrary mixed perimeters and assistive technology were not browser-qualified. No held geometry family or fitter scope widened. Existing unrelated App lint and aggregate docs drift remain separate; no full-suite claim.
