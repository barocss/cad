# D1382 — proposal review while editing

Completes #161. The proposal controller exposes its existing active-command, sketch and rollback guard as reviewBlocked. New Preview, Accept and Rebase actions are disabled while that guard applies. A short recovery instruction beside the existing actions names the active command, sketch or rollback action. Disabled controls reference that text through aria-describedby. Existing Hide, Reject, busy and stale semantics are retained. No new explanatory panel, geometry change or proposal-acceptance policy.

## Verification

- Node 22.19.0: 7/7 focused tests PASS using the actual hook and component. Covers command/sketch/rollback guards, no worker/commit on blocked paths, immutable source, disabled states, associated recovery text, Hide/Reject exceptions, idle recovery and decided cards.
- Studio TypeScript and production build PASS. Targeted hook/component/test ESLint PASS. Full App lint retains one existing error: unused `_k` at line 2416, verified unchanged in parent HEAD; no full-lint pass claim. Diff check PASS.
- Actual Chrome WebGPU at 1024×800 and 1440×900 PASS with a locally generated pending fillet proposal on a 40×30×10 mm, 12-degree drafted extrusion. Box width 23 draft survives disabled Preview/Accept mouse clicks, focus and Tab attempts. The Box recovery text is readable. Cancel restores actions; Preview shows the expected −19.13 mm³ delta and Hide restores the original. Document, proposal and saved input bytes remain unchanged during review. Applying Box retains the open proposal as stale with Rebase available; Undo restores Preview and Redo restores stale state.
- Screenshots at both widths were visually reviewed with no action/recovery overlap.

Receipt: `/tmp/d1310-publish.1Wqzsz/d1382-first/receipt.json`, SHA256 `fe085e1818f8014071360e7a36623f916f36cf5dab1e3260542e69c24f07b252`. Production log: `d1382-build.log` in the same parent directory.

The first actual-browser run passed. Sketch/rollback are focused-test coverage, not actual-browser coverage. This run does not accept or rebase the proposal. The pre-existing in-flight async review race is outside this action-state fix. Existing HOLDs and aggregate docs/inventory drift remain unchanged; CI is not awaited under the owner instruction.
