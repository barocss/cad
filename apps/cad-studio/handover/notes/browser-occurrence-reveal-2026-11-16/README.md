# Exact placed-part and nested-path Browser reveal (#266)

Base: `ac98e7403e18741b0821b5af190a72f17101610d`. Continues the bounded P4 base-body reveal without new picking, geometry, schema or layout redesign.

## Delivered

The common header action is now **Show selection in Browser**. Existing base body/face/edge behavior is retained, with single top-level placed parts and existing single nested occurrence selection added.

Placed rows are resolved by complete ID/path, never name or shared definition. Every path segment must be unique and visible. Missing/hidden/ambiguous paths, mixed or multiple selections, display-body suffixes and stale authored/effective evaluations are refused without substituting a host or changing visibility. The existing `instanceEvaluationCurrent` and nested-selection APIs supply the freshness and occurrence boundaries.

The tree's expanded-path Set is now owned above the conditional Browser mount. A reveal adds only the target's ancestors and preserves unrelated expansions, including across Browser collapse. A new document generation resets this UI-only state. Expansion, Browser open and the owned one-shot request are batched; all target rows mount before the existing layout-effect consumer. There is no deferred timer. Body and instance registry keys have separate namespaces, with React 19 exact-node ref cleanup preventing an old same-path cleanup from removing a new row.

## Verification

- **47/47 focused/related tests PASS**: base reveal, occurrence reveal, nested selection, selection edges and stop-work ownership. The 15 reveal tests cover identity, all four hidden/duplicate path levels, missing paths, mixed selections, current instance/source checks, ancestor-only union, immediate controlled row rendering and old-node ref cleanup.
- Studio TypeScript **PASS**. Production Vite build **PASS**, 3.98s. Changed helper/hook/Browser component/new test lint clean. App lint still reports only the existing unused `_k` at line 2438; full repository lint is not clean.
- Actual Chrome WebGPU **1024×800 and 1440×900**: 24 fillers plus two same-named hosts sharing a definition, exact depth-three path `sub1/level/inner/p2`. Reveal restores required collapsed ancestors, preserves unrelated `sub2` expansion, does not expand the corresponding sibling path, and keeps hidden siblings absent.
- Repeated reveal, Browser collapse/reopen and keyboard Enter retain the exact nested read-only card and target focus. Top-level `sub2` remains the host selection with its existing placement UI, not a leaf or the same-named `sub1`.
- Accepted Doc, base/nested selection evidence, card text, dirty, Undo/Redo controls, instance bounds, camera and window scroll are unchanged by reveal. Narrow nested and wide host screenshots visually reviewed.
- A normal base-body rename after reveal is the **first Undo**; Redo restores it. Actual OPFS Save bytes exactly equal the accepted document. Close project, page reload and Open restore the edited document without saved tree/request state. This is not a native-folder roundtrip.
- Existing two-size base reveal driver and existing `nested-select-browser.mjs` also **PASS**, including nested read-only selection/Delete protection and host selection behavior. All three browser receipts have no runtime/console errors, frozen-source changes or downloads.
- Driver syntax and diff checks PASS. Separate Model TypeScript was not repeated after the previously recorded checkout dependency-resolution failure; no Model source changed.

Runs from Studio after the normal heavy-run gate, with `PW_DIR` and `CHROME`:

```sh
BROWSER_SELECTION_REVEAL_FROZEN=1 node test/browser-selection-reveal-browser.mjs <output>
BODY_BROWSER_REVEAL_FROZEN=1 node test/body-browser-reveal-browser.mjs <output>
NESTED_SELECT_SOURCE_FROZEN=1 node test/nested-select-browser.mjs <output>
node scripts/test.mjs body-browser-reveal browser-selection-reveal nested-selection selection-edge stop-work-ownership
```

## Remaining qualification

The requested body/top-level/nested functional paths are implemented. #266 remains OPEN for its broader actual-browser interruption matrix: forced linked-revision replacement or document transition exactly between request and layout-effect consumption has not been artificially injected. Those stale-owner/ticket/source paths are guarded and unit-tested, not claimed as executed browser races. No unlimited scale, virtualization, new viewport nested picking, native geometry accuracy or hidden-part reveal capability is claimed. Original #126 WIP and every HOLD remain unchanged.
