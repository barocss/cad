# Round-tube T Butt refusal guidance (#28)

## Reproduction and change

A round-tube T frame with Butt ends can correctly fail with `BUTT_ON_OPEN_SIDE`: the branch end spans the open side of the through member. Previously this became a generic feature failure.

The model error adapter now identifies the gap, reports the point and member indices in one-based form when the kernel supplies valid indices, and suggests trying T-joints → Cope for a T-joint. It asks the user to inspect the resulting preview. Original error code and kernel detail remain available. Unrecognized locations do not produce guessed indices. Other refusal codes are unchanged.

This is guidance, not a geometry repair or a guarantee that Cope always succeeds. No kernel, connection inference, default joint, or saved model changes were made.

## Verification

- Before: native round-tube T fixture reproduced `BUTT_ON_OPEN_SIDE`; the same fixture with Cope produced two positive-volume bodies. The new title assertion failed against the original adapter.
- After: `frame-butt-guidance.test.ts` 2/2 passed, including malformed index and unrelated-code boundaries.
- Model and Studio TypeScript passed; targeted lint passed; Studio production build passed (4.04 s).
- Frozen-source Chrome driver `frame-butt-guidance-browser.mjs` passed. Actual Frame creation showed the implicated members and Cope suggestion with Apply disabled. Switching to Cope produced two bodies. History's failed Butt edit kept the accepted Cope document. Undo, Redo, and in-memory reopen passed. No downloads or browser errors.
- Screenshots reviewed: the creation refusal displays Point 4, member 2 meeting member 1, and the conditional recovery instruction. The model unit fixture uses a differently ordered point list and correctly reports Point 3.

Run the browser driver with `FRAME_BUTT_FROZEN=1`, `PW_DIR`, and `CHROME` configured as for other frozen-source Studio browser drivers. Runtime receipts and screenshots are local verification artifacts, not repository assets.

## Scope remaining

This addresses #28's round-tube T Butt failure-guidance case only. Frame path edge-picking and other connector placement/diagnostic acceptance cases remain separate; #28 stays open. Existing WIP and HOLD scopes are untouched.
