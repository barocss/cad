# D2060 — Measure actual Fillet radius drag and release timing

P1 [row 20](../../roadmap-rows/20.md) · Test-only qualification · [#214](https://github.com/barocss/cad/issues/214). Compare D2058 `98a4cb4f111a22a3ea2a98e4befb1ada5656d22f` and D2059 `6f48d24e76dab6bc3bf7e22402ec5e451296029c` with the same desktop test driver. Run D2058 from a separate local Git archive using the same dependencies and no dependency install.

Use the [D2058](../four-top-history-fillet-radius-2026-11-27/README.md) 12 × 8 × 8 mm four-upper-rim Box. The 1440 × 1000 Chrome/WebGPU viewport has the same orthographic end-on camera at 50.68265 CSS px/mm in each run. After one unreported warm-up per version, use eight real R1 → R2 mouse movements and five real R1 → R2 → R3 → R1 → R3 → R2 reversals with immediate release. Each trial starts from the accepted R1 History. Cancel interim samples and explicitly apply the final R2 in each run.

The observer records trusted pointer events and all timestamps on one page clock. The first changed radius is observed in the readout during `requestAnimationFrame`. Geometry time is when the real GPU renderer receives the changed Fillet body. Preview request and reply timing come from the unmodified worker request and response. Release is settled when the renderer has final R2 and the HUD has its ready preview. If ready before release, its post-release time is zero. Timing and screenshots are kept separately, so taking a screenshot does not delay the measured pointer sequence.

| Case and measure | D2058 median [min, max] ms | D2059 median [min, max] ms |
| --- | ---: | ---: |
| Single move to changed radius readout | 25.70 [6.70, 27.00] | 26.35 [7.30, 27.30] |
| Single move to renderer receiving geometry | 41.85 [12.30, 48.80] | 43.00 [13.10, 45.30] |
| Single move, release to final ready state | 0.40 [0.30, 21.20] | 0.40 [0.30, 9.30] |
| Reversal, first move to changed radius readout | 25.30 [6.80, 25.50] | 7.80 [7.20, 27.20] |
| Reversal, first move to renderer receiving geometry | 38.10 [11.40, 41.30] | 13.80 [11.90, 43.20] |
| Reversal, release to final ready state | 44.50 [41.00, 49.10] | 43.30 [39.20, 49.60] |
| Reversal, request-to-request spacing | 39.70 [9.40, 60.70] | 39.40 [9.70, 57.00] |
| Reversal, reply-to-reply spacing | 50.75 [4.60, 79.80] | 48.00 [4.70, 81.40] |
| Reversal, request-to-reply | 34.90 [0.30, 50.10] | 34.65 [0.30, 43.80] |

- **PASS, queue and geometry.** Eight single moves produce eight preview requests in each run. Twenty-five reversal moves produce 19 and 20 requests. Three and six replies, respectively, arrive after a different radius has already been requested by the pointer. Intermediate previews may still be visible while the final value is pending. No earlier radius replaces the final renderer input after it reaches R2 in any reversal sample. Each explicit Apply yields one strict solid of 736.7315570194866 mm³ with the same native digest `487231389d025c3dddedce308556042e372e4c651e95304a2c74be9ddb84d5a3`.
- **PASS, checks.** Both actual Studio runs, browser-driver syntax, scoped ESLint, identical observer and driver sources, and diff check. The observer-only change leaves production source unchanged.
- **FAIL, initial measurement assertion.** The first attempt failed to associate renderer installation with the last observed matching reply. The corrected observer records receipt before the product handler and associates the installed target with the first relevant reply. Both changes are limited to the measurement driver.
- **NOT_RUN.** Full local suites and local production rebuild for the test-only change, display scan-out latency, mobile, and the remaining original #214 camera cases. The measurements are descriptive results from sequential local trials. The first mechanical CAD baseline remains 8/10. Overall CAD remains unmeasured.

```sh
# Run the two commands from the frozen archived D2058 and D2059 trees, respectively.
D2060_SOURCE_FROZEN=1 node apps/cad-studio/test/box-top-fillet-history-browser.mjs "$OUT/parent" --timing
D2060_SOURCE_FROZEN=1 node apps/cad-studio/test/box-top-fillet-history-browser.mjs "$OUT/current-v2" --timing
node --check apps/cad-studio/test/box-top-fillet-history-browser.mjs
node --check apps/cad-studio/test/fillet-timing-observer.mjs
git diff --check
```

Desktop receipt SHA-256 is `bebe6b2fc1f4d92c167593903e8326932a22e5d90957cb67be256fc59825ec45` for D2058 and `62d3a14df2b278b71cda2c9a6f34e72df96dda6f7ad2e69ada203c19ee0c3cc3` for D2059. Both copies of the browser driver hash to `80b67a8b9d71c0dcadb8ece269d2fe2ffc63ef2f3b78e8565f18696c3a49c9e8` and both frozen observer sources hash to `b6284c7a6312c47b180a16d110763f78031d62264ca6bd56134cb3211da39091`.
