# Selected-base reachability diagnostic (#276)

Source baseline: `dbb1948d7`. Scope: [barocss/cad#276](https://github.com/barocss/cad/issues/276), an existing library diagnostic, not a new connectivity solver or a Physics/Motion feature.

## Before and change

The authored static fixture contains `base`, a valid Lock pair `a`–`b`, and grounded `g`. All instances deliberately share the display name `Same name`. With the default root, the admitted group is `{base,g}`; with root `a`, it is `{a,b}`. Before the change, excluded members were described as joined to no other part and not fixed, even though the Lock and grounding remained present. The new focused test first failed on that exact message after confirming the expected graph.

Only the `NOT_CONNECTED` message changes. It identifies both the excluded part and selected base by display name plus stable ID, explains absence of an accepted mate/fixed path to that base, and says the part is excluded from this joint tree. It asks the reader to check the selected base and existing relationships. It does not advise deleting valid mates, forcing grounding, or infer geometric contact or physical safety.

Code, per-part `parts`, issue ordering, base fallback, links, joints, loops and coupling admission are unchanged. No document fields or serialization format are added.

## Verification

Using Node 22.19.0 and the existing serial heavy gate, from `packages/barocss-cad-model`:

```sh
node scripts/test.mjs robot-connectivity-diagnostic robot-joints.test mates.test
node ../../node_modules/eslint/bin/eslint.js src/robot/joints.ts test/robot-connectivity-diagnostic.test.ts
node ../../node_modules/typescript/bin/tsc --noEmit
```

- PASS: 28/28 tests; targeted lint and Model type-check exit 0.
- PASS: exact expected two-group membership, fixed edges, issue order/parts, duplicate-name IDs, root reversal, invalid-base fallback, immutable input.
- PASS: controlled failed-mate exclusion retains `MATE_PROBLEM`; cam-only disconnected relationships introduce neither tree edges nor couplings. An initial test incorrectly expected `CAM_NOT_SEATED` for the entirely excluded pair; the test was corrected to the existing admission contract, without changing product behavior.
- PASS: existing joint-tree conformance, isolated/grounded, unsupported-motion classification and static mate tests.
- PASS: public `Robot.joints()` equals controlled `get_joints`; whole document remains unchanged. Native container encode/fresh read preserves instances, Lock relative pose, grounded state and robot base, and yields the same public diagnostic.
- NOT_RUN: Studio Physics/Motion UI, playback, dynamics, export, desktop Save/Open, whole-suite acceptance. Container read is not desktop UI evidence.

## HOLD boundary

The issue explicitly permits a narrow correction to the existing library diagnostic while retaining Studio Physics/Motion activation HOLD. This work reads existing static relationships and changes explanatory text only. It neither activates those UI modes nor changes assembly solve, joint-tree traversal, contact, freedom, motion, or manufacturing policy. Existing unrelated WIP and HOLD scopes remain untouched.
