# D2112 — Measure the current local MCP review contract

P0 [row 04](../../roadmap-rows/04.md) and B09 · [#324](https://github.com/barocss/cad/issues/324) · Base `2106d27ca722dbccd89fcdc86a3a7f2bb7b2f67b`.

Keep the current grouped-v2 contract for the measured local stdio client. The existing driver now measures exact request and response frames and tests two additional input refusals. Actual Chrome decodes both MCP images and compares their visible face names with the native solid. The front, top and right raster extents agree with independent box dimensions within the drawn stroke. The change affects verification only.

## Measured profile

The Node 22.19.0 direct JSON-RPC client uses protocol `2025-06-18`, `barocss-cad-tools-v2`, and autonomy 2. It receives the thirteen native tool schemas directly. Compact serialized tool list plus newline SHA-256 is `1d5085ac4864e91efaf525407c8de3e1925e335d59b8840fd50eb577918d807c`. The local test needs no transformed function schema.

| Representative exchange | Request bytes | Response bytes | Elapsed ms |
| --- | ---: | ---: | ---: |
| Initialize, including child-process startup | 171 | 186 | 506.76 |
| List | 59 | 17,530 | 0.18 |
| Describe the Box command | 106 | 377 | 0.18 |
| Describe the full feature command action | 127 | 46,956 | 1.48 |
| Unknown review argument | 160 | 312 | 0.28 |
| Pinned single height edit | 173 | 2,384 | 6.15 |
| First 8 mm four-view review | 106 | 37,506 | 85.10 |
| First 12 mm four-view review | 106 | 38,178 | 59.88 |

The 27 exchanges total 3,649 request bytes and 248,337 response bytes, including line delimiters. Timings measure write to received frame in one local session. [The prior edit and retry sample](../agent-edit-cost-2026-11-20/README.md) measures 273 request bytes across two local calls versus 1,200 Studio HTTP body bytes across two calls that carried a document and conversation context. That comparison uses the same edit on the same seed. Provider usage, token estimates and provider caching are unmeasured.

## Verification

- **PASS, local protocol and native edit.** List, action discovery, valid and stale edits, native rebuild and both image pins pass in a persistent session. Invalid action and unknown argument return text-only diagnostics. The stale review returns no image. Each refusal and read-only review preserves the native file bytes. The independent volume requirement fails at 8 mm and passes at 12 mm, at 6,400 and 9,600 mm³ respectively. A valid image leaves the first engineering failure unchanged.
- **PASS, actual desktop and image decoding.** Chrome decodes 26,786- and 27,290-byte PNGs. Front heights measure 92 and 136 pixels including the edge strokes. Three orthographic extents agree with 40 × 20 × 8 and 40 × 20 × 12 mm stock. All eight cells contain labels and solid foreground. Both legends resolve to the same original native faces. Actual Studio opens the 12 mm MCP file, edits the Extrude to 16 mm, saves and opens in a fresh context. Independent and native volumes agree at 12,800 mm³. The original MCP file remains byte-identical. The run retains 1,272 source files with zero source changes, runtime errors or console errors.
- **PASS, controlled client retirement.** A local client sends two real `query.render` requests for revision `8168a3f064c2d702` and retires them by request ID. For the deadline case, the client pauses its own MCP child for a 15 ms wait before sending cancellation and resuming it. Both retired IDs receive an image from the server. The client drops both responses and accepts the third request with the same current revision and verified PNG digest. The saved file stays identical. Server interruption and production UI cancellation remain unqualified. [MCP cancellation specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation).
- **PASS, retained coverage.** [The existing budget run](../agent-tool-description-budget-2026-11-25/README.md) retains each grouped schema. [D2065](../mcp-stale-visual-review-2026-11-27/README.md) refuses old images after a same-path Studio Save. [D2066](../sketch-corner-proposal-rebase-2026-11-27/README.md) refuses an old candidate pin after explicit rebase and verifies the new images and approved native result. The B09 baseline retains its checkpoint and restore evidence.
- **PASS, affected checks.** 25 Model and 19 Studio tests, both driver syntax checks and diff check.
- **FAIL, corrected checks.** The first input test matched JSON-escaped text instead of the decoded diagnostic. The first image test allowed three pixels across two antialiased edges. The final check allows two pixels per edge and retains the same independent dimensions.
- **NOT_RUN.** Third-party clients, provider schema adapters, tokenizer estimates, live model quality and usage, server cancellation, full local suites and mobile. [#324](https://github.com/barocss/cad/issues/324) remains open. First mechanical CAD is 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources during the desktop flow.
node apps/cad-studio/test/agent-review-part-mcp.mjs "$OUT/wire"
AGENT_REVIEW_SOURCE_FROZEN=1 node apps/cad-studio/test/agent-review-part-browser.mjs "$OUT/studio" "$OUT/wire/edited-stock-part.bcad"
pnpm --dir packages/barocss-cad-model test toolset tool-contract views
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp cad-external
```
