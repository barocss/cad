# Face-pair edge selector admission (#326)

Parent: `dee813eb27c997b71cd61569da87e19d99000278`.

## Implementation

`packages/barocss-cad-model/src/chat/names.ts` resolves both face selectors to distinct current display identities on one body, honoring `on`. It uses display edge adjacency, not suffix-stripped text fragments. Zero candidates are missing; multiple distinct edges are refused with sorted candidate names. Multiple native names of one display edge are not multiple candidates. A deterministic name is emitted only if it resolves uniquely back to the selected display edge across all bodies.

Same-face aliases, stale faces, duplicate display face names and cross-body pairs are refused before mutation. Explicit edge-name selection and the general `resolveNames` API are unchanged. No nearest rematch, topology naming/schema change or new kernel capability.

## Evidence

- `selectors.test.ts` plus specification/toolset/tool-contract suites: 49/49 PASS.
- Synthetic split-display fixture: two disconnected display edges sharing a face pair are refused regardless of edge traversal order; one display edge with two native names remains accepted. Explicit edge names still resolve. `select`, `run_command` and `measure` refuse without evaluation or state mutation.
- Actual native 40×20×8 box: independently walk B-rep coedges and loops to determine all 12 edge adjacencies, compare selectors, strict B-rep PASS; repeat after fresh JSON read. Existing unique-edge Fillet and face measurement pass.
- Actual generated 12-tooth gear: native faces retain tooth suffixes, but the existing display mapper strips suffixes and repeats roles such as `n0.flankL`. Those ambiguous display roles now refuse. Current unique face IDs resolve by actual adjacency without interpreting the tooth suffix as an edge occurrence. This is admission safety, NOT a repair of gear display naming or gear blend qualification.
- Actual external stdio MCP via `edge-selector-mcp.mjs`: box same-face and gear duplicate-role `query.select`/`query.measure` refuse; unique box edge selection recovers; mass results and input file bytes remain unchanged. PASS.
- Changed production/MCP test ESLint: no errors (existing test conventions retain console/any warnings). Studio TypeScript/Vite build PASS.

## Limits

The two-disconnected-edge and merged-name controls are synthetic display fixtures, not new physical kernel qualification. Gear display-name normalization remains unchanged and should not be represented as fixed here. No browser UI run or persistence schema change; the real consumer check is external stdio MCP. #126 WIP and HOLD scope remain untouched.
