# D1306 — Propose and approve the clipped Sweep bore fillet

2026-11-15 · FEATURE qualification · P5, rows 07 and 30

Local stdio MCP at autonomy L1 can discover and propose the D1305 Fillet on the original start mouth of the clipped Sweep. Studio exposes the resulting proposal through its existing review card. The regression uses explicit tool calls and the actual Studio file and approval flow.

- **PASS — local MCP.** The agent found native edges `n4_e13` and `n4_e14` by their start-cap and bore face pair. Both revision-pinned curvature reads matched 1/mm. Direct application and MCP acceptance were refused at L1. A 10 mm proposal was refused because the fillet runs off its supports. It preserved the source bytes. An eligible 0.20 mm proposal recorded a rounded −0.056 mm³ volume delta with the part outputs and features intact.
- **PASS — desktop Studio WebGPU.** Studio showed the proposed body, returned to the original with Before and Hide, and preserved the pending file. Accept recorded the human as approver and the agent as proposer. Undo restored the pending proposal and Redo restored the accepted result. History allowed a radius change to 0.25 mm. Native Save and fresh Open retained the approved proposal and edited feature. The two observed preview mesh volumes distinguish the displayed bodies. The native volume checks below use the kernel result.
- **PASS — native and reopened agreement.** The accepted and edited solids each passed strict B-rep checks at genus 1. The 0.20 mm result measured 2140.729855268 mm³. The edited and reopened 0.25 mm results measured 2140.697185028 mm³ and shared the same B-rep hash. Volume errors against the independent D1305 values stayed below 4.75e-8 mm³. Reopened MCP reported 2140.697 mm³ and the accepted proposal. Its reads preserved both input files.
- **PASS — focused lint and whitespace.** This delivery adds a product regression through the existing native joint, proposal and edit entry points.
- **NOT_RUN.** Production rebuild for this test-only change, hosted inference, other autonomy levels, Fillet at the new cut rim, WebGL2, mobile and full local suites. The broader [Sweep issue](https://github.com/barocss/cad/issues/10) remains open.

## Commands and evidence

Node 22.19.0. The heavy gate serialized the desktop run. All 910 frozen sources matched after cleanup. The run recorded zero page errors, console errors or worktree changes.

Receipt SHA-256 `cf397804ae0d409ec29575c904b2061db8cf5676a9638a95ee78dc2ee2bf82b0`. Native Save SHA-256 `fa5747b05196ce326d54cfd1ea2a9efbdc17f6b4b8e58da6f0db052de39465b2`. Reopened B-rep SHA-256 `1ac88d056b64341cd0f53f763e4f80ee2ab0459070f09d6b0d88679c8e7b6caa`.

```sh
D1306_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-bore-cut-fillet-proposal-browser.mjs <external-evidence>
pnpm exec eslint apps/cad-studio/test/arc-bore-cut-fillet-proposal-browser.mjs
git diff --check
```
