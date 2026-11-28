# D2210 — Keep a staged browser proposal after response loss

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `52ead9fb8`. The build uses the same product source as D2209.

- **PASS, actual desktop.** Chrome 158.0.8127.89 used WebGPU and its WebMCP testing API. The driver held only the delivery of the genuine Extrude reply, after Studio recorded `P1` and before the caller received a response. The caller aborted. Chrome returned `AbortError`. A retry with the consumed descriptor was refused. Studio kept one pending proposal and the original 40,000 mm³ part.
- **PASS, review and persistence.** One user approval produced 15 mm and 60,000 mm³. Undo restored 10 mm and 40,000 mm³. Redo and project Save → Close → reload → Open restored 15 mm, 60,000 mm³ and the one recorded user decision. Reopen required a fresh read grant. There were zero page errors, console errors or downloads.
- **FAIL, first verification attempt.** It reached the expected client error and refused retry, then requested a read as the old registrations were being retired after Accept. The corrected driver waits for retirement before granting reads on the new revision.
- **NOT_RUN.** Repeating the request under a new explicit grant, lost response from an external client, mobile, and deployment. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/run.sh"
git diff --check
```
