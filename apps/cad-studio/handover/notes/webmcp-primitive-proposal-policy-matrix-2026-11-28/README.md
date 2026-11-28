# D2199 — Verify the remaining browser proposal policies across L1–L4

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `b97cd5cea1c8480b6a84380787205dc84b5f6a93` · [D2198 centred Hole](../webmcp-hole-policy-parity-2026-11-28/README.md).

This decision verifies the first Box, the first Cylinder and one rectangular Extrude height revision in desktop Studio and the actual local stdio MCP server. Each feature was exercised at all four autonomy levels.

| Operation | Browser and stdio result at each level |
| --- | --- |
| First Box | 80 × 50 × 10 mm and 40,000 mm³ |
| First Cylinder | R5 × 10 mm and 785.398 mm³ |
| Extrude revision | 80 × 50 × 10 → 15 mm and 40,000 → 60,000 mm³ |

- **PASS, 12 paired cases.** For every case, the explicit WebMCP grant accepted one revision-pinned proposal and refused a stale revision. The browser and stdio proposals agreed on base, operations, feature order, risk and checks. The accepted models matched in feature nodes and outputs, and the native volumes matched the independent dimensions.
- **PASS, approval ownership.** Stdio refused all 12 attempts to approve a browser-authored proposal. The refusal preserved each input file byte for byte. All 12 browser proposals required Studio review and recorded the user. Local MCP proposals at L1/L2 also required the user and were opened and approved in Studio. At L3/L4, local MCP could approve its own low-risk proposals.
- **PASS, actual desktop evidence.** Chrome 158.0.8127.89 used 12 isolated contexts in one browser process. There were zero page errors, console errors, downloads or frozen-source changes. D2198 and D2199 together cover 16 paired cases across the four existing proposal actions. The first mechanical CAD baseline remains 8/10.
- **FAIL.** Zero failures in this batch.
- **NOT_RUN.** Per-call timeout and execution abort, additional constraint or hard-requirement fixtures, external browser clients, paid live qualification, mobile and full local suites. Overall CAD and natural-language completion remain unmeasured. The broader issue acceptance stays open.

```sh
BROWSER_POLICY_FROZEN=1 node "$OUT/browser-policy-parity.mjs" "$OUT/desktop"
git diff --check
```
