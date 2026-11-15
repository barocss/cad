# D1381 — current Direct crossing results

Completes #162. Crossings keeps one result owned by the immutable Direct snapshot, object ID, axis and plane position. A mismatched result is hidden immediately and discarded so Undo cannot resurrect it. Success, no-crossing and error states follow the same rule. Axis and position inputs stay unchanged. Find crossings computes against the current geometry. No geometry or automatic-recomputation change.

## Verification

- Node 22.19.0 focused tests: 4/4 PASS using the actual private component and actual native crossing query with controlled React scheduling. Checks first-render invalidation, Move/Undo/Redo snapshots, object/query changes, repeated Find, errors, input retention and source immutability.
- Studio TypeScript, focused ESLint, production Vite build and diff check PASS.
- Actual Chrome WebGPU at 1024×800 and 1440×900: 22 computed states PASS. Original X7 crossing moves from Z0 to Z10; X20 no-crossing becomes [20,-7,10] after Move X10. Same-ID pole Z22 produces [20,-7,18.571]. Every Move, Undo and Redo first removes old crossing/no-crossing text; plane inputs remain X/7 or X/20. Each Find matches independent affine parameter/point calculations, and native inspection checks exact endpoints. Inspection leaves the document unchanged.
- Result/input screenshots visually reviewed. The unchanged fixture camera leaves the moved curve outside the viewport; screenshots prove readable controls/results, not geometry visibility. Native inspector provides geometry evidence.

Receipt: `/tmp/d1310-publish.1Wqzsz/d1381-first/receipt.json`, SHA256 `995ed75365dfebdd9f84c460a46bfa816586df2846404b0ad85e00d98089e90e`. Build log: `d1381-build.log` in the same parent directory.

Initial focused test expectations omitted JSX spaces; corrected assertions passed without product changes. Browser passed on its first run. One degree-1 curve is qualified, not every curve family or assistive technology. Existing HOLDs and aggregate documentation/inventory drift remain unchanged. CI is not awaited under the owner instruction.
