# D2198 — Keep primitive replay independent of JSON property order

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `e14f79ba365ad3925b4cc341214774b6d12cf448`.

Desktop Studio opened a valid Cylinder with the same geometry and revision as the authored part. The saved object properties appeared in a different order. The replay check compared serialized text, so the share offered neither the Extrude nor the Hole proposal. Saved Box and Cylinder commands now compare their complete replayed nodes with the existing canonical JSON function. A change to any replayed value still prevents recognition.

## Verification

- **FAIL, original.** Chrome 158.0.8127.89 opened the translated R5 × 10 mm Cylinder with volume 785.398 mm³. The Hole grant was absent on the reordered source. The focused Model case reproduced the same refusal at the identical revision.
- **PASS, fixed browser and local MCP.** Four Studio contexts, at L1 through L4, opened the same input and staged a Ø4 mm through Hole at [8, −3] mm. Each browser call refused a stale revision and left the accepted model intact until approval. True stdio MCP matched the proposal base, operations, feature order, risk and checks, and refused to approve the saved browser proposal at all four levels without changing the file bytes.
- **PASS, resulting model and ownership.** At L1 and L2, the independently staged local proposal also needed a person and was approved after Studio Open. At L3 and L4, local MCP accepted its own low-risk proposal under the existing policy. All eight results had the same feature nodes and outputs. Each resolved to 659.734 mm³. All four browser decisions recorded the Studio user. The first Box desktop control through project save and reopen also passed. No page errors, console errors, downloads or source changes occurred in the successful runs.
- **PASS, local gates.** 32 Model tests, including reordered Box and Cylinder and a real command-value mismatch control. Model type check, scoped lint and whitespace passed.
- **FAIL, first comparison driver after the fix.** A local summary variable hid the browser summary before the stdio comparison. The corrected driver passed the four-level matrix.
- **NOT_RUN.** Full local suites, a new production build, other WebMCP actions across all four levels, external browser clients, paid live qualification and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test browser-extrude-proposal proposals revision-pinned-edit fastener-history-edit
BROWSER_POLICY_FROZEN=1 node "$OUT/browser-hole-policy-parity.mjs" "$OUT/desktop"
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-box" --box
git diff --check
```
