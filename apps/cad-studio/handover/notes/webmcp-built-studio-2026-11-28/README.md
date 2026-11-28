# D2209 — Verify browser proposal review in the built Studio

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Product source `5a76418a9f509f880b7b9e3e114780d5ea69cc03`.

- **PASS, production bundle and desktop.** Vite built the Studio assets. Chrome 158.0.8127.89 used WebGPU and the actual WebMCP testing API on a loopback secure origin. Only the built assets supplied app code. There were zero development probe globals, page errors, console errors, or downloads. Browser tool calls and ordinary Studio controls drove the scenario. External font CSS was intercepted locally.
- **PASS, opt-in and review.** An 80 × 50 × 10 mm part started with zero browser tools. After sharing, the summary returned 40,000 mm³ and the top/bottom measurement returned 10 mm. Revocation removed the pending grant and refused its old descriptor. The 12 mm preview showed +8,000 mm³. Reject kept the original revision and 40,000 mm³. A separate one-call grant let a person approve 15 mm. The resulting revision changed and eventually reported 60,000 mm³ and 15 mm.
- **PASS, document history and persistence.** Undo restored the original revision, bounds and 40,000 mm³. Redo restored the accepted revision and 60,000 mm³. Save, project close, page reload and Open restored the accepted geometry and the user decision. The tool catalogue was empty on reopen until the user shared again. Calls with a stale revision were refused.
- **PASS, deferred volume contract.** Approval, Undo, Redo and reopen first yielded current revision and bounds with `volume: null`. Once the visible mass arrived, a new call at the same revision returned the completed volume. The summary never reused the earlier revision's volume.
- **FAIL, initial verification assumptions.** The first test tried to find a proposal control before sharing. The next test expected the volume before deferred mass calculation finished. The corrected test verifies both lifecycle boundaries.
- **NOT_RUN.** Deployment, external natural-language agent clients, built Studio with flags off or another backend, and mobile. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
cd apps/cad-studio
pnpm exec vite build --outDir "$OUT/dist"
bash "$OUT/run.sh"
git diff --check
```
