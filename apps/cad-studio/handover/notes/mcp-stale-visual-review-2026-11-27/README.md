# D2065 — Reject a visual review after Studio replaces the saved source

P1 [row 04](../../roadmap-rows/04.md), [row 08](../../roadmap-rows/08.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `ae421e26235780bb35808e1da4bc952f24e4f9d0`.

An external stdio MCP session opens a saved 80 × 40 × 8 mm rectangular plate and previews a pending proposal to round two corners to R4. The current part and pending proposal have distinct images and revisions. With that session still running, actual desktop Studio changes the extrusion to 9 mm and saves to the same file. Before the fix, both old images were returned as successful results with identical PNG bytes and metadata to the prior review. The native inspection of the pending image also returned the old result. Studio identified the proposal as stale.

File-backed MCP now checks the same device, inode and byte digest used by the existing save protection before rendering or inspecting, and again before publishing the result. An observed replacement invalidates review for the session. The reply consists of a `STORAGE_CHANGED` text error with reopen guidance. A file which cannot be checked reports `STORAGE_UNAVAILABLE`. The same internal render and proposal approval paths supply valid reviews. The chat state-file store and ordinary opened-session summary keep their existing contracts.

## Verification

- **PASS, desktop and wire.** With the file current, Studio can Preview and Hide P1, and real MCP verifies both native R4 cylinders against the candidate revision and decoded PNG SHA-256. After Studio Save, the old pinned base render, pinned candidate render, candidate native inspection and unpinned render all return text-only `STORAGE_CHANGED`. The saved bytes are identical before and after these requests. The existing D708 stale-write refusal and explicit unsaved-session summary also pass in their separate desktop run.
- **PASS, reopen and persistence.** A fresh MCP session renders the 9 mm accepted model with a new image digest. It refuses the old base pin and refuses the stale proposal with the current pin. Studio reloads, opens the 9 mm file, and saves a new 10 mm edit. Independent file and volume checks give 25,600, 28,800 and 32,000 mm³. The controlled folder-picker adapter and the MCP process share the same local disk file. All observed edits and project Save/Open use the actual Studio desktop controls.
- **PASS, protocol boundaries.** Focused tests detect equal-size and equal-mtime replacement on the same inode. A controlled write between review admission and delivery suppresses the computed image. The product uses no additional renderer or external provider.
- **PASS, feature checks.** Studio 19/19, scoped ESLint, browser-driver syntax, Studio type check, production build and diff check. The fixed desktop run records zero page and console errors and retains 1,259 source files through cleanup.
- **FAIL, baseline and harness.** The unchanged product returns the 8 mm PNGs from the old session after the 9 mm Studio save. Earlier harness attempts tried to reopen an already active project row and required exact binary equality for R4. Close/reopen the folder and compare the measured radius within tolerance.
- **NOT_RUN.** Independent vendor clients, paid live calls, cross-machine storage, full local suites and mobile. #324 remains open. The first mechanical CAD baseline stays at 8/10 and overall CAD completion is unmeasured.

| Visual result | Revision | Decoded PNG SHA-256 |
| --- | --- | --- |
| Accepted 8 mm | `05570c679ec9e943` | `2fc7a55be4c8c8960b0bdd83667ce4ca52dd3debd03a0ebb2f30b4e08cf4fb4c` |
| Pending R4 pair on 8 mm | `1f9020739416c346` | `8d5142f242161738bec5cf5c8f909ce2b62c8cdc6e80e227b24fc5b665600683` |
| Accepted 9 mm after reopening | `f4cd83ec8d5f8d83` | `2031482099940e19aabc25c0df92044c6fee4bdc42f95205f9500971fd63858a` |

```sh
# Use Node 22.19.0, the local-only Chrome/Playwright preload and one heavy gate at a time.
D2065_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/mcp-stale-save-browser.mjs "$OUT/baseline-v3" --visual-review --baseline
D2065_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/mcp-stale-save-browser.mjs "$OUT/fixed" --visual-review
D708_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/mcp-stale-save-browser.mjs "$OUT/write-control"
TEST_CONCURRENCY=2 pnpm --dir apps/cad-studio test cad-external toolset-mcp tool-contract-mcp
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```

Run the baseline command before the production patch. Desktop receipt SHA-256 values are `9fe24e982465bbedee4a3ca54fdcd04cfa7b9ad345c92cc76d1ab0ebeb3d8db6` for the baseline, `59086537f8f5116bbcd8bca0ece92c75173f5558474b263343c7768cb4a86570` for the corrected session and `66548bb38048bc1aa3a808d54e6ae89831aae6ded7566117686e3c78b61c13f7` for the stale-write control.
