# D2202 — Stop the read registration sequence when its grant ends

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `8eeb6297c4ebe328ff02c64734d363950c6bdc20`.

Studio checks the registration signal after the summary registration resolves. The measurement registration starts only while the same read grant is active.

## Verification

- **FAIL, original.** A Chrome driver held the successful summary registration completion on a 10 mm Extrude, opened a 12 mm replacement, shared it, and then released the old completion. Studio attempted the old measurement registration with an aborted signal. Chrome refused it and kept only the replacement tools.
- **PASS, actual desktop.** Chrome 158.0.8127.89 registered the two replacement read tools once each. Completing the old registration caused zero extra calls. The old summary handle was rejected. The replacement revision `31a029b31fdff14b` reported 48,000 mm³.
- **PASS, proposal and project.** The driver held a successful proposal registration, revoked sharing and granted a replacement for the same current document. The old handle was rejected before and after completion. Only the replacement proposal could stage. User approval produced 60,000 mm³. Save, Close, reload and fresh project Open preserved the accepted document. No errors, downloads or frozen-source changes occurred.
- **PASS, regression.** The checked-in browser summary driver exercises the delayed read registration through document Open and compares the two reads with local stdio MCP. 18 focused Studio tests, Studio type check, scoped lint and whitespace passed.
- **NOT_RUN.** Explicit insecure-context and Permissions Policy controls, Strict Mode and HMR injection, full local suites, external agent clients and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-registration-lifetime.mjs" "$OUT/desktop-baseline" --baseline
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-registration-lifetime.mjs" "$OUT/desktop-fixed"
BROWSER_PART_SUMMARY_FROZEN=1 node apps/cad-studio/test/browser-part-summary.mjs "$OUT/desktop-summary"
pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability proposal-history-focus
git diff --check
```
