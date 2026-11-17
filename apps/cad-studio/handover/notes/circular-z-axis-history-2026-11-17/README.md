# #25: edit a Z circular pattern axis in History

2026-11-17 · bounded feature · parent `d9a48ee4d24ac7a8d9097aa5b986a1e3885818e3` (exact frozen source hashes retained in original receipts).

## Actual gap and change

Creation already offers Axis at X/Y. Before this change, actual History on the same saved Z One body pattern offered Count only (`before-count-only.png`). Baseline01 PASS means that missing-input observation was reproduced, not that the feature was complete.

Model `app/editFields.ts` now exposes Axis at X and Axis at Y for Z circular-pattern nodes only. An omitted pivot displays the existing native default origin. A setter rechecks the latest node kind/axis and finite value, changes only one coordinate, and retains the other coordinate, authored Z, Count, angle, span, parent and identity. Zero and negative finite positions are allowed. There is no span editor, axis reinterpretation, legacy intent inference or new native geometry/schema rule.

Existing BindableField behavior remains: bound input is disabled by NodeEditor, unrelated coordinate edits preserve its Dim, and explicit parameter-menu unbind uses the existing numeric setter. Tests verify parameter identification, explicit unbind/rebind and other-coordinate preservation. Binding directly into an omitted pivot still has the existing multi-leaf changedLeaf limitation (returns null); this change does not broaden that API. A same-value setter preserves node identity, not the wrapper array identity. No claim of captured async callback testing is made.

## Validation

- New focused tests 4/4: origin/coordinate preservation, legacy/signed distribution metadata and Z/Dim preservation, finite/latest-kind-axis refusal, existing binding behavior.
- Initial combined run 18/23 with five existing circular-span Count-admission failures. An in-memory esbuild HEAD editFields substitution reproduces exactly the same five failures (4/9 pass). No working source was overwritten for that comparison.
- Test-only correction separates UI Count admission from explicit historical/raw native recipes. UI Count1 creation throws and invalid Count edits preserve the document; raw Count1 angle360 codec tests and invalid native Count rejection remain. No production Count behavior or golden changed.
- Final new+adjacent matrix **23/23 PASS** (`circular-pattern-axis-history circular-pattern-span circular-pattern-count editFields`). Final Model tsc and targeted lint PASS after that test edit. Studio tsc and driver syntax/lint PASS; production build **5.39s PASS**. No entire kernel suite.
- Actual after01 first PASS: change then Close discards draft; blank X disables Apply and preserves Doc; explicit X2/Y−3 commits; complete document equals original except pivot `[2,-3,0]`; Undo/Redo restores exact documents; genuine native Save download and fresh-context Open retain values.
- Independent Python uses literal integer quarter-turn rotations of the eight seed corners, checks one output `b2`, exactly32 native vertices, and a one-to-one coordinate match within **1e-9 mm**. Edited and reopened outputs both report maximum coordinate residual0. No rounded set comparison; no strict B-rep, arbitrary-angle or mass certification claimed.
- Final actual source capsule1043 unchanged through cleanup, page/console errors and watched changes0. Two contexts, browser and server closed; heavy gate released, source freeze ended. `fresh-axis-fields.png` shows the reopened X2/Y−3 controls; `invalid-axis-retained.png` shows blank refusal. Both actual result screenshots and baseline were independently inspected; synthetic, no personal information.

## Scope and remaining work

#25 remains OPEN. Earlier Subtract source selection/application, broader path/axis combinations and separate-copy reconstruction are not solved here. Span editing is explicitly excluded. Bound-parameter UI interaction is focused/static evidence, not a separate actual browser run. Existing WIP, shared GPU, native-folder and all HOLD scopes remain unchanged.

## Reproduction

```sh
export PATH=$HOME/Library/pnpm/nodejs/22.19.0/bin:$PATH
export PW_DIR=$HOME/.cache/barocss-playwright
export CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
# Shared gate acquire heavy120; release on EXIT; no concurrent source writers.
cd packages/barocss-cad-model
node scripts/test.mjs circular-pattern-axis-history circular-pattern-span circular-pattern-count editFields
pnpm exec tsc --noEmit -p .
pnpm exec eslint src/app/editFields.ts test/circular-pattern-axis-history.test.ts test/circular-pattern-span.test.ts
cd ../../apps/cad-studio
pnpm exec tsc --noEmit -p .
node --check test/circular-z-axis-history-browser.mjs
pnpm exec eslint test/circular-z-axis-history-browser.mjs
pnpm build
CIRCULAR_Z_AXIS_FROZEN=1 node test/circular-z-axis-history-browser.mjs /tmp/cad-z-axis-after-01
# Historical before run used --baseline on unmodified product source.
```

Original receipts: `/tmp/cad-z-axis-before-01/receipt.json`, `/tmp/cad-z-axis-after-01/receipt.json`. Compact copies retain hashes and cleanup; logs.txt preserves first failures, HEAD comparison and final outcomes. createFlow records immutable before/frozen/after/after-cleanup source hashes. Existing prior [D453 spread preservation](../body-pattern-spread-2026-11-03/README.md) concerned Count maintaining authored spread and is not rebranded as this new axis editing capability.

Actual downloaded file: 735 bytes, SHA-256 `394a230e7268e4fae533baf0c243a2b631ff58ce77e1b541180a5a638d7e2a94`. Independent reviewer found no blocker in either the product or the separate span-test alignment.

After actual cleanup, only surplus final blank lines in the new driver/test were removed; runtime source hashes therefore identify the executed pre-trim text. Driver syntax was checked again. No executable statement changed.

The original HEAD comparison was an inline `node --input-type=module` stdin script, not a named checked-in script. It read `git show HEAD:packages/barocss-cad-model/src/app/editFields.ts` at parent d9a48ee4d24ac7a8d9097aa5b986a1e3885818e3 and substituted only that file through esbuild onLoad, bundling the unchanged circular-pattern-span test into a temporary directory. Its raw script hash was not captured; logs.txt records the output SHA and all five failures. This is an execution result, not a claim of a fully archived standalone baseline runner.

Public logs replace the home prefix with `<HOME>`; each section header retains the SHA-256 of the original unredacted local log. Shared node_modules resolution through the original checkout is not evidence of executing its protected source; the root inspector-metafile review found no protected checkout `/src` input.
