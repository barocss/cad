# D2203 — Hide WebMCP sharing when the browser policy denies it

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `bebbe3840644c16b92f527708bd5a2fdd516dd52`.

Studio checks the document's Permissions Policy before offering WebMCP. If the browser advertises the `tools` policy and explicitly denies it, Studio treats the capability as unavailable. Secure-context and feature detection still cover browsers with other policy interfaces.

## Verification

- **FAIL, original.** Chrome 158.0.8127.89 exposed `document.modelContext` under a real `Permissions-Policy: tools=()` header and denied discovery with `NotAllowedError`. Studio still offered its sharing button. Clicking it led to the registration failure notice.
- **PASS, actual desktop.** The fixed Studio hid the sharing control when the header denied tools. A non-secure HTTP origin mapped to the local Studio server also hid the control. The secure control offered sharing, registered its read tools and returned the exact 40,000 mm³ stock volume.
- **PASS, ordinary CAD in all three contexts.** Desktop WebGL2 opened the same stock, applied a 10 → 12 mm Extrude edit, and verified Undo and Redo. Each result was 48,000 mm³. The focused browser summary/stdio MCP comparison, 18 Studio tests, Studio type check, scoped lint and whitespace passed.
- **FAIL, fixture setup.** The first driver omitted the hostname mapping because it launched the default Chrome. After correction, the supported path needed to wait for the Chat panel. The final receipt records four Vite local-network HMR diagnostics from the insecure-origin fixture separately from product console and page errors. The final result had zero product errors, downloads or frozen-source changes.
- **NOT_RUN.** Strict Mode and HMR injection, other browser engines, full local suites, external agent clients, paid live qualification and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
BROWSER_POLICY_FROZEN=1 node "$OUT/browser-policy.mjs" "$OUT/desktop-fixed"
BROWSER_PART_SUMMARY_FROZEN=1 node apps/cad-studio/test/browser-part-summary.mjs "$OUT/desktop-summary"
pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability proposal-history-focus
git diff --check
```
