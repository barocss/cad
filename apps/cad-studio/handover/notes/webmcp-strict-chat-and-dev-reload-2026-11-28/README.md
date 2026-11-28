# D2205 — Verify Chat tool lifetimes through Strict Mode and development reload

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `20ec00e2a5811d6dfbaabab37f9afd6585e898d6`.

The Chrome driver serves the ordinary Studio development entry and places the actual Chat panel in a separate React Strict Mode root. It forwards the existing Studio props and uses Chrome's production WebMCP registration behavior. The Studio viewport uses WebGL2.

- **PASS, actual Strict Mode effect replay.** The fixture recorded two mounts and one cleanup on initial Chat mount, then four mounts and three cleanups after the user closed and reopened Chat. The first explicit grant registered summary, measurement and Extrude once each. Closing Chat retired all three and rejected the old handles. Reopening Chat started unshared. A second explicit grant registered each tool once.
- **PASS, actual Vite development reload.** The renewed proposal required user approval and produced 60,000 mm³. The driver saved the browser project, granted all three tools again and sent a Vite `full-reload` message. The reloaded page had zero registrations. Fresh project Open restored the approved revision `d0a99ba6de624b89` at 60,000 mm³. An explicit grant registered each tool once. Chrome 158.0.8127.89 had zero page or console errors, downloads, or frozen-source changes in the passing trial.
- **FAIL, separate full-App-root probe.** Applying Strict Mode to the entire Studio root with WebGPU reproduced `GPUCanvasContext.getCurrentTexture` on an unconfigured context, followed by failure to reach the ready state. This trial remains outside the verified Chat adapter scope. Renderer work remains under the existing HOLD. The first driver also needed to match Vite's generated CommonJS import for the React binding.
- **NOT_RUN.** Module-level hot replacement, full-root Strict Mode with WebGL2, full local suites, other browser engines, external agent clients, paid live qualification and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-strict-reload.mjs" "$OUT/desktop"
git diff --check
```
