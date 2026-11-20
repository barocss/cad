# Review the exact part rendered by a local agent tool

Issue [#324](https://github.com/barocss/cad/issues/324) covers client discovery, cost measurement and visual review. This check exercises the local grouped-v2 stdio client and an editable part.

## Original result

One local session discovered 13 tools and made 22 protocol requests. It authored a 40 × 20 × 8 mm box, rendered A, edited the height to 12 mm, checked the native volume against 9,600 mm³ and rendered B. Both images arrived as four views in one PNG. Neither response identified the model revision or the PNG bytes. Passing the earlier revision to the original server failed with UNKNOWN_ARGUMENT. The baseline measured a missing interface. It did not reproduce an out-of-order response.

## Public contract and measured result

The optional expectedRevision comes from query.rebuild or a previous query.render in the same part scope. Successful replies return that revision, the SHA-256 of the decoded PNG bytes, the four views and the face legend. A stale pin returns RENDER_STALE, the requested and current revisions, and zero images. An invalid pin returns RENDER_INPUT. A section labels the revision of its original part. A placed part uses the revision of the same scoped part as rebuild. A tool that receives a working document has no authority to label it as a particular candidate attempt.

The final local client made 23 requests over one stdio session. At 8 mm the image was valid and the hard 9,600 mm³ requirement failed. At 12 mm the requirement passed. Rendering with A's revision after the edit returned zero images and preserved the saved bytes. Both matching pins returned the corresponding PNG. The decoded bytes matched the following hashes with Node's crypto implementation.

| Height | Rebuild and render revision | PNG SHA-256 | PNG bytes |
| --- | --- | --- | ---: |
| 8 mm | 05a9fd55be312f4d | 7dc0e9c55ba29ffef64eeecc53a7214f05d8301a2d61ceaa1b4f5d7061e99d00 | 26,786 |
| 12 mm | 8168a3f064c2d702 | 67f4e6dffdd905ce8c9b334fb8f8439ccb62c4de45182ed88c9d5cc02b8be4d1 | 27,290 |

The original measurement added the requirement after the edit. The final client sets it before rendering A so it can check that a successful image preserves a failing requirement. The revision covers authored requirements as well as geometry. The raw PNGs matched the original geometry's PNGs in both runs.

## Desktop flow

Studio opens the exact editable file produced by the client. The feature editor reads 12 mm. Changing it to 16 mm invalidates the old Box command recipe as specified by the feature editor. The independent check requires all eight expected corners, six faces, twelve edges, a valid strict B-rep, and worker and native volumes within 1e-7 mm³ of 12,800 mm³. Studio saves the result and opens it in a fresh browser context. The original MCP file and the user's stored volume requirement are preserved.

## Qualification

**PASS** — 21 Model view, contract and toolset tests; 5 Studio MCP tests; affected lint (one pre-existing test annotation warning), both package type checks, Studio production build, generated tool reference check, one local MCP session, and the desktop Open/edit/Save/fresh Open flow. The native reopened volume was 12800.000000000002 mm³. The Studio source watch recorded zero changes. Discovery plus system prompt measured 24,993 characters under the existing 25,000-character guard.

**FAIL before correction** — the original server omitted both identity fields. An early tool hint exceeded the prompt guard by 41 characters. An initial fixture expected changing the document's outputs table alone to change the image; the evaluated body list still contained both bodies. The final fixture tests a real change of evaluated body scope and a geometry-preserving document revision separately. The first browser driver expected the stale Box command recipe to survive direct editing; it now checks the documented invalidation and preserves the other fields.

**NOT_RUN** — external AI clients, paid model calls, candidate-attempt selection or late delivery across two candidates, remote file freshness, token billing, and whole CAD qualification. The revision is the existing 16-digit staleness key; PNG SHA-256 checks bytes. The generated agent-tool table also synchronizes four previously stale Assembly and Drawing entries with the current source.

## Reproduce

Use Node 22.19.0, the installed repository dependencies and two new directories outside the checkout. Run one command at a time under the shared heavy gate. Keep the source frozen during the desktop run.

```sh
node apps/cad-studio/test/agent-review-part-mcp.mjs "$WIRE_OUT"
cd apps/cad-studio
AGENT_REVIEW_SOURCE_FROZEN=1 node test/agent-review-part-browser.mjs "$STUDIO_OUT" "$WIRE_OUT/edited-stock-part.bcad"
```

Set PW_DIR to the local Playwright installation and CHROME to the desktop Chrome executable. The MCP run writes the protocol transcript, editable file and PNGs outside the checkout. The Studio run writes the screenshots, native and independent checks, and source-freeze receipt there.
