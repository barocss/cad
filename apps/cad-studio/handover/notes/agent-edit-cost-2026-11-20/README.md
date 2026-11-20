# Cost of one local agent edit and retry

Issue [#324](https://github.com/barocss/cad/issues/324), section B. The input is the synthetic two-feature stock in `test/fixtures/agent-edit-stock.bcad`. Both clients opened the same 334-byte file. Its rectangular footprint is 40 × 20 mm and its initial extrusion height is 8 mm.

Both clients called `features.edit` at index 1. The first call sent `{"h":"12 mm"}` and received `"h" must be a number.` The retry sent `{"h":12}`. Both clients made two edit round trips, with one refusal and one accepted change. The grouped MCP tools and the Studio chat service used the existing edit handler.

## Measured traffic

| Client and boundary | Refused request / reply (bytes) | Recovery request / reply (bytes) | Total request / reply (bytes) |
| --- | ---: | ---: | ---: |
| Persistent native-file MCP client, stdio JSON-RPC frames including newline | 139 / 145 | 134 / 2,377 | 273 / 2,522 |
| Desktop Studio to chat service, HTTP POST body / decoded SSE body | 537 / 295 | 663 / 1,204 | 1,200 / 1,499 |

The MCP client already had the file open. Studio sent its full 261-byte compact document in each request. The request on retry included two conversation turns. The accepted Studio response included the updated 262-byte document in both its state and done events. The Studio requests contained 537 and 663 Unicode characters. The responses contained 295 and 1,197 characters. HTTP headers, TLS, subprocess traffic inside the Studio service and provider token usage are outside these totals. The direct client sent fewer request bytes and received more response bytes on this fixture.

| Additional operation | Calls | Request bytes | Reply bytes |
| --- | ---: | ---: | ---: |
| MCP initialize | 1 | 169 | 186 |
| MCP tools/list | 1 | 59 | 17,254 |
| MCP describe features.edit | 1 | 124 | 1,617 |
| MCP describe query.mass and query.rebuild | 2 | 245 | 1,354 |
| MCP verification (three mass queries and a rebuild) | 4 | 417 | 4,440 |
| Studio chat service status | 1 | 0 | 67 |

## Acceptance

**PASS.** Refusal preserved the exact native-file bytes and the Studio document, body and history. Native volume stayed at 6,400 mm³. The accepted result measured 9,600 mm³. Studio Undo returned to the original stock. A second Undo reached the same predecessor observed before either chat turn. Two Redos restored the accepted result. A fresh Studio context opened the saved result and passed the strict solid, volume and eight corner checks. Both clients produced identical final model fields. Studio also kept one accepted chat provenance entry.

**NOT_MEASURED.** Paid-model usage, context caching, task latency across clients and cost for other feature trees. These figures give one local comparison of two client boundaries. They do not forecast a provider bill.

## Reproduction

Use Node 22.19.0 and the existing desktop Chrome and Playwright installations. Run each command in a separate heavy-gate slot from `apps/cad-studio`. Use new external output directories under an existing parent. The browser uses the local scripted provider and the actual Studio chat service. Keep the checkout frozen until Chrome exits.

```sh
node test/agent-edit-cost-mcp.mjs --seed test/fixtures/agent-edit-stock.bcad --output "$MCP_OUT"
AGENT_EDIT_COST_SOURCE_FROZEN=1 node test/agent-edit-cost-browser.mjs --seed test/fixtures/agent-edit-stock.bcad --output "$STUDIO_OUT"
```

The MCP receipt separates setup, discovery, payload and verification. The Studio receipt links the measured lengths and SHA-256 digests to each captured request and response. Both runs retain evidence in the external output directories.
