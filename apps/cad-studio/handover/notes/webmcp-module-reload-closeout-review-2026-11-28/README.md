# D2211 — Verify browser grants after a Vite module reload

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `e904ef865`.

- **PASS, actual desktop.** The active Vite client graph contained `ChatPanel.tsx` with one importer. The driver called Vite's module reload API on that graph entry. The browser received Vite's generated `full-reload` message and reloaded the page. The new page had zero registered tools. Reopening the saved project restored the exact approved revision and 60,000 mm³. An explicit new grant registered summary, plane measurement and Extrude once each.
- **PASS, effect replay.** Chrome 158.0.8127.89 used actual WebMCP with WebGL2. The driver ran the actual Chat panel in a separate Strict Mode root and observed its two initial effect mounts, one cleanup and no duplicate registrations. Closing Chat retired all three handles. The passing run recorded zero page errors, console errors, downloads and frozen-source changes.
- **FAIL, first driver.** Its URL filter missed the module's timestamp query after the reload. The revised filter matches its pathname and checks the same Strict Mode sequence after reopening.
- **Open acceptance.** The current browser tools deliberately require Studio approval at all four autonomy levels. The original issue explicitly includes the L2 direct edit and first-build exceptions, as well as application of the current autonomy to browser execution. Current product code forces the browser approval path and revokes the grant when the autonomy control changes. The local MCP policy and the browser's proposal parity have separate evidence in [D2199](../webmcp-primitive-proposal-policy-matrix-2026-11-28/README.md) and [D2206](../webmcp-protected-cad-approvals-2026-11-28/README.md). Keep #204 open for the policy decision. Continue the next modeling feature.
- **NOT_RUN.** External natural-language agent clients, deployment and mobile. Studio's current config uses full reload for this module and does not have an in-place React hot update for it. D2205 records the separate full-root WebGPU Strict Mode failure under the existing rendering HOLD. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/run.sh" desktop-final
git diff --check
```
