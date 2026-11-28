# D2206 — Verify protected CAD changes through local and browser approval boundaries

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `ae4438c10b40686ead3dbd443b5c821a874bc629`.

The four fixture changes were placement of an inserted part, a coincident mate, movement of a file-backed locked occurrence, and a drawing title and view definition. The agent calls used the existing local stdio MCP server. Studio opened and reviewed the saved proposals from the L4 sessions.

- **PASS, local policy at L3 and L4.** Direct calls returned `needs_approval` for eight cases. Their proposed operations recorded the same protection reasons. Stdio refused all eight agent approval attempts and preserved the pending file bytes. The reasons included assembly, mates, locked part and drawing.
- **PASS, actual desktop browser boundary.** Explicit sharing of the ordinary base part registered only the two read tools and its one Extrude proposal grant. The grant refused extra arguments for assembly, mate, drawing and placed part. Opening the assembly or locked-part document retired old handles and left sharing disabled. Opening Drawing left the browser registry empty.
- **PASS, actual Studio user.** Chrome approved all four saved proposals opened from the L4 sessions. The accepted changes placed the occurrence at X60, saved the exact coincident mate references, preserved the locked source and its feature nodes, and showed the approved title on the drawing sheet. Undo and Redo restored the expected documents. Page errors, console errors, downloads and frozen-source changes were zero.
- **FAIL, first driver.** Its first Studio approval used exact floating-point equality for 6,400 mm³. The measured difference was about 10⁻¹² mm³. The corrected control uses a 10⁻⁸ mm³ tolerance.
- **NOT_RUN.** Other mate kinds, export, file-source save-back, full local suites, external agent clients, paid live qualification and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
BROWSER_POLICY_FROZEN=1 node "$OUT/browser-protected-proposals.mjs" "$OUT/desktop"
git diff --check
```
