# D2074 — Review and approve a Guided Fill from the local Agent

P1 [row 04](../../roadmap-rows/04.md), [row 08](../../roadmap-rows/08.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `0d3f7bec7cb5118b013fbcefad26ecba6dcde29f`.

The local Agent discovers `direct-guided-fill` through `describe`. It obtains the current Direct revision and geometry IDs from `query.summary` and proposes one open surface with the intended seam, two other boundary IDs, guide, and donor. The command uses the existing Guided Fill construction. The proposal records a Direct geometry approval reason. The Agent can render the pending result on a copy with both revision pins. A person uses Preview and Accept in Studio to change the document.

## Verification

- **PASS, local MCP at autonomy 4.** Discovery reports the supported IDs. Direct command and batch execution, a stale source pin, a disconnected guide, and Agent acceptance each refuse. The invalid attempts preserve the working file. A valid proposal changes only proposal metadata. The candidate render returns one additional Direct surface and preserves every prior object.
- **PASS, desktop Studio WebGPU.** Preview shows the clipped open patch while the working document keeps the three original boundaries, guide, and donor. Hiding the guide invalidates the displayed candidate. Both the prior source revision and a current source revision with a stale proposal pin refuse rendering without returning an image. Undo restores the original proposal. Explicit Studio Accept records `user` as the approver. Undo, Redo, Save and fresh Open preserve the intended documents.
- **PASS, native and image readback.** The reopened native patch retains its triangle trim and the original Direct sources. Its guide agrees within 0 mm over 65 stations and its interior reads `(7.5, 12, 4.5)` mm. The 1,000 × 1,000 candidate and approved-file renders have the same SHA-256 `3bd497fff1537351dee458c1fffd41df9c6fcf75223e529e2eb026d313f694c9`. The original render SHA-256 is `96be40f193b498622c6bac080c5747ae5a4650b196eca98e377b668f8f6c564d`.
- **PASS, regression and feature build.** The manual Guided Fill browser flow still passes with the same shared fixture. The two existing Ruled proposal tests and eight native Guided Junction tests pass. Scoped ESLint, Studio and Model type checks, browser-driver syntax, diff check and Studio production build pass. The Agent browser run retains 1,113 frozen source hashes through cleanup with zero page and console errors.
- **NOT_RUN.** Paid live agents, sheet proposals on a mixed Direct/solid preview, persistent sewing, full local suites and mobile. This is one additional Agent workflow under #324. First mechanical CAD remains 8/10. Product-wide completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop execution and the build.
pnpm --dir packages/barocss-cad-model test agent-direct-ruled-proposal guided-junction
tsc --noEmit -p apps/cad-studio
tsc --noEmit -p packages/barocss-cad-model
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
GUIDED_FILL_AGENT_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/guided-fill-agent-browser.mjs "$OUT/final"
GUIDED_JUNCTION_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/guided-junction-browser.mjs "$OUT/guided-regression"
```
