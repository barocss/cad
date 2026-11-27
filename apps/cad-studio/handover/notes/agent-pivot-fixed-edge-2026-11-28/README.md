# D2087 — Propose a saved Pivot face hinge replacement

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `e66929669bdabf228dc3d1837214b51995c27cdc`.

Local MCP `query.edit_fields` returns the saved Pivot face's `hingeEdge`, its exact choices and the current revision. Use the feature index and that revision with `features.edit` and one `values.hingeEdge` inside a proposal. The same History command reads the original stock and constructs the replacement for discovery, proposal and approval. The angle stays at the saved value. At autonomy L1 the proposal stays pending until the user approves in Studio.

## Verification

- **PASS, baseline reproduction.** Local MCP reports no fixed-edge field for the saved Pivot face and refuses the edit. Desktop Studio opens the source with its intact original upper hinge.
- **PASS, local MCP.** Discovery returns four edges of the original face on translated stock. A missing or stale revision, a mixed angle edit, an original rear edge and a no-op all refuse. Each refusal preserves the source file bytes. A valid request creates P1. Direct edit and remote approval are refused at L1.
- **PASS, actual desktop Chrome WebGPU.** Preview and Hide leave the accepted document unchanged. The overlay shows equal added and removed regions with zero net volume. Explicit Accept records the user approval. Undo and Redo restore the corresponding documents, and Save and fresh Open restore the lower hinge and 12° in History. The run freezes 1,267 files with zero source changes, page errors or console errors.
- **PASS, native geometry.** The original 40 mm hinge changes from `n2_e2` at Z=26 mm to `n2_e0` at Z=14 mm. The exact new curve, two vertex IDs, endpoints and both incident face uses match the original translated stock. All eight vertices match the independent construction within 0.000001 mm. The strict solid volume is 8,987.837102 mm³ in both positions. The independently calculated Z centroid changes from 20.136220292 to 19.863779708 mm. The approved and reopened native B-rep digests agree.
- **PASS, affected checks.** 37 Model and seven Studio tests, both type checks, scoped ESLint, browser driver syntax, diff checks and the Studio production build.
- **FAIL, first baseline harness.** The inspector expected a plain mode argument. The helper sends JSON-encoded arguments. Parsing the argument restored the baseline run.
- **NOT_RUN.** Placed-part edits, arbitrary rotated stock, full local suites, mobile and live providers. The wider direct-edit issue #629 remains open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop runs and the build.
PIVOT_HINGE_AGENT_FROZEN=1 node apps/cad-studio/test/pivot-hinge-agent-browser.mjs "$OUT/baseline-final" --baseline
PIVOT_HINGE_AGENT_FROZEN=1 node apps/cad-studio/test/pivot-hinge-agent-browser.mjs "$OUT/candidate"
pnpm --dir packages/barocss-cad-model test draft-command-pull toolset tool-contract proposals.test
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp draft-neutral-feedback
```
