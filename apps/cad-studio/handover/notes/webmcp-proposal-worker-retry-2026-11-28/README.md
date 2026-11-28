# D2194 — Recover a browser proposal after a Worker failure

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `b809a9e00aa2c62a6281379c5c9bd58881f3e5bd`.

Chrome evaluates a 12 mm browser proposal for a 10 mm rectangular Extrude. The driver holds the successful native reply and sends a controlled error event to its owning Worker. Studio reports the failure and retires the read and edit tools. The visible Retry engine action starts a replacement Worker that evaluates the exact original part.

## Verification

- **PASS, actual desktop Studio.** Chrome 158.0.8127.89 used one original Worker and one replacement. The failed call returned `stale_part`. After Retry and a new read and edit grant, delivering the held reply and calling the old handle left the exact 40,000 mm³ source and history intact.
- **PASS, actual recovery.** The new Worker staged a 15 mm proposal. Studio approval applied a 60,000 mm³ solid. Undo, Redo and browser-project Save, Close, reload and fresh Open retained the expected documents. No page errors, console errors, downloads or source changes occurred across 708 frozen files.
- **FAIL, first driver counter.** It counted only proposal requests. Retry evaluates with the regular Model request, so the counter missed the replacement Worker. The final driver counts both request types and waits for the replacement's evaluation.
- **NOT_RUN.** Timeout, an uncontrolled Worker crash, full policy parity, live-client qualification, full local suites and mobile. This decision changes no runtime source. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-proposal-worker-retry.mjs" "$OUT/desktop-final"
git diff --check
```
