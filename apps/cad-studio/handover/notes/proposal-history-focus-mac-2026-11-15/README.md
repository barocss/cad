# D1383 — proposal history keyboard focus

Completes #160. The Chat column remembers a user-activated history toggle and restores focus within that same column only if the activated button is replaced. Unrelated state changes and surviving buttons do not steal focus. Both toggle locations expose pressed state; the panel name changes between Show and Hide decided proposals. Redundant closed-chat text is removed while Open chat and workspace restrictions remain.

## Verification

- Node 22.19.0: 4 new focus tests and 7 adjacent proposal-review tests, 11/11 PASS. Covers repeated replacement, column ownership, no programmatic focus, surviving buttons, consumed pending state, labels/state, Model and Drawing controls.
- Targeted ESLint, Studio TypeScript, production build and diff check PASS. Existing unrelated App `_k` lint error and aggregate docs/inventory drift are unchanged.
- Actual Chrome WebGPU at 1024×800 and 1440×900 PASS. A real locally generated fillet proposal is accepted through Studio. With one accepted and zero open proposals, three consecutive Enter open/close cycles retain the corresponding toggle focus and accurate pressed state. Model Open chat works without redundant closed text; Drawing Open chat stays disabled with its workspace hint. The document and native strict BRep remain unchanged through history inspection. Native volume is 10553.214670399802 mm³; BRep digest `dd52c1d189936c62e5d19bf23b7ba65fa17269887d6cb19a5aebd4bd9853af27` before and after.
- Expanded/collapsed screenshots at both widths were visually reviewed. Drawing screenshot qualifies the control gate, not the completed drawing layout.

Receipt: `/tmp/d1310-publish.1Wqzsz/d1383-second/receipt.json`, SHA256 `8143856115bb47924dd2d8056a3b924c4b5ecb56d6e8598be5ceb2c9ff99f396`. Build log: `d1383-build.log` in the same parent directory.

The first run stalled before its first accepted-state snapshot, with an unbounded setup wait. It was stopped and preserved as incomplete/undiagnosed, not counted as a product failure or pass. The second run adds bounded waits and before/after-Accept diagnostic captures; no product fix was made between runs. No screen-reader, Render or full-suite claim. All HOLDs remain; CI is not awaited under the owner instruction.
