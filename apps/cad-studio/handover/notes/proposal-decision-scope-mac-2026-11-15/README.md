# D1385 — partial proposal decision scope

Completes #163. Accepted decisions with saved left_out IDs show partial acceptance and the excluded IDs in a named scope group. Their original summary is explicitly labeled Original proposal; the title remains. No accepted feature count, missing historical label or current-model inference is invented. Duplicate saved IDs display once. Only the exact generated rebase note is suppressed when the existing rebased badge renders; arbitrary notes and saved data are preserved. No engine/schema or acceptance behavior change.

## Verification

- Node 22.19.0: 16/16 focused proposal/history tests PASS. Covers partial/full/rejected/open/legacy states, unknown historical IDs without current nodes, duplicate exclusions, rebase deduplication and custom notes, immutable data.
- Targeted ESLint, Studio TypeScript, production build and diff check PASS.
- Actual Chrome WebGPU at 1024×800 and 1440×900 PASS: open legacy proposal, actual Rebase and preview, exclude Extrude n4, Accept 1 of 2. Card shows Original proposal: 3 added, partially accepted except n4, and one rebase mention. Actual decision left_out is [n4]; n4 is absent and the accepted model has one extrusion and one hole. Retained construction data is not misrepresented as an added block.
- Strict native BRep volume 6299.469035085114 mm³ matches independent 6400 − 32π = 6299.469035085127 mm³. Undo/Redo and native Save/fresh Open preserve exact document, decision card and native proof.
- Both decided and reopened screenshots at both widths were visually reviewed. Scope text fits. Reopened camera framing crops the body edge; native proof verifies geometry, not a full-frame visual claim.

Final receipt: `/tmp/d1310-publish.1Wqzsz/d1385-fourth/receipt.json`, SHA256 `3d6cf3f5b692f49a5a185fdd3d26f40076fa619ebe46df02c3f36335ac5fac18`. Build log: `d1385-build.log` in the same parent directory.

Three preserved harness failures preceded the final pass, with no product changes between runs: (1) legacy reader normalized empty outputs, corrected the authored fixture mapping; (2) checkbox.uncheck asserted before asynchronous recomputation, changed to click plus bounded checked/ready checks; (3) expanded sidebar hid Save at 1024, collapsed history/chat through existing UI before Save without resizing or changing document. Failure receipts: `231140131382675c8612180d2596a657c5fd363e0a66e434683977fb3b465a26`, `6d7f6a334da19e28081c893697c61e80d9ec9ff86a2fdfbcd79dc503ab334d80`, `17abaa80aa87a11a4604072d4954d0a4a1213c5e0b727672077cf550fc8274da`.

No all-combination or screen-reader claim. Existing App lint baseline, aggregate docs/inventory drift and all HOLDs remain. CI is not awaited under the owner instruction.
