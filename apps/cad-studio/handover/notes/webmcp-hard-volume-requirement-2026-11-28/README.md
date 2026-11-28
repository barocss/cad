# D2204 — Verify proposal approval with a hard volume requirement

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `bcb8c1995920b5b7c9d190e0a4bddf308fd269c2`.

Chrome Studio and the actual local stdio MCP server evaluated a translated R5 × 10 mm Cylinder with one hard rule. The finished part must retain at least 700 mm³ of material. The original volume is 250π mm³. A centred Ø4 mm through Hole leaves 210π mm³ (659.734 mm³). The Ø2 mm control leaves 240π mm³ (753.982 mm³).

- **PASS, L3 and L4 hard requirement.** Both adapters produced the same proposal operations, base, risk and native check delta. The Ø4 mm candidate moved R1 from passing to failing and displayed high risk in Studio. Local MCP denied its own high-risk proposal at L3 and denied its own rule-breaking proposal at L4. Both refusals preserved the active file bytes. The Studio user rejected the browser candidate and retained the original model and requirement.
- **PASS, passing control and approval ownership.** The Ø2 mm candidate retained R1. The local MCP agent accepted its own proposal at L3 and L4. Studio required a user approval for the browser proposal at both levels. Stdio refused all four approval attempts on browser-authored files and preserved their bytes. The accepted geometries and requirement records matched.
- **PASS, actual desktop.** Chrome 158.0.8127.89 verified Undo and Redo in both levels. The L4 control survived browser project Save, Close, reload and fresh Open, including the rejected predecessor and its original requirement. No page or console errors, downloads, or frozen-source changes occurred.
- **FAIL, first driver.** The first assertion used an incorrect pattern for the L3 refusal. The corrected check verifies the L3 reason and R1, and the L4 check verifies its distinct requirement refusal.
- **NOT_RUN.** Other protected changes such as assembly, mates, drawing and locked parts, Strict Mode and HMR injection, full local suites, external agent clients, paid live qualification and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
BROWSER_POLICY_FROZEN=1 node "$OUT/browser-hard-requirement.mjs" "$OUT/desktop"
git diff --check
```
