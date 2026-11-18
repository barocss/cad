# Existing #270: same-selector Open currentness

Validation-only on 5b886c605. No product change or new issue. This qualifies two actual same-name Open transitions under the existing selected-body contract; it does not close all #270 acceptance.

Both source and replacement use `same-name.bcad` and identical selected Extrude selector b1/n1. Source width30, replacement width70; depth12 and height6 mm. In a separate scenario the old source has a Translate that consumes b1 and produces a real drawing refusal. The new document is valid in both cases.

Instrumentation installed before Worker construction intercepts exactly one real drawing reply by Worker identity/request ID. It saves the original MessageEvent and defers only the engine onmessage callback invocation. Success payload remains width30; failure payload remains the actual not-a-unique-current-output refusal. No geometry, success/error flag or request is synthesized; mesh/result, mass, progress and other responses continue normally. This is response-delivery timing simulation, not control over actual Worker computation duration.

Actual Chrome PASS for old success and old failure: original response held → Open replacement with same filename and selector → live current sheet front70×6/top70×12 → deliver old response → whole accepted document, sheet state and live SVG coordinates unchanged. Export SVG/DXF remain enabled and old refusal text is absent. Native Save/fresh Open preserves the replacement and current 70 mm sheet. Four contexts/browser/server closed, changes=[], errors/consoleErrors=[], disk37GiB, no owned process remains.

Independent XML/DXF readback of both actual download pairs passes front70×6/top70×12 and each front/top SVG line's DXF VISIBLE/HIDDEN LINE counterpart. This is one-way matching, not proof of no extra DXF entities; right/iso geometry and PDF are not independently qualified. Local screenshots inspected and show the current replacement sheet.

Independent read-only review found no blocker in target identity, original-event forwarding or live DOM assertions. Existing related Model regressions28/28 PASS; driver syntax/targeted lint PASS. No TypeScript/product change, no new type/build claim.

Reproduce: `DRAWING_BODY_OPEN_FROZEN=1 node apps/cad-studio/test/drawing-body-open-currentness-browser.mjs <output>` with Chrome/PW_DIR, then `python3 apps/cad-studio/test/drawing-body-open-export-oracle.py <output>`.

Limit: Open remounts DrawingWorkspace, so this includes remount plus engine/lane lifecycle protection. It does not independently prove every same-hook edit race, body-list response/draft ownership, New/Close, rapid A/B selection, mesh wire scheduling, crash/restart, arbitrary native families or manual/auto dimension lifecycle. Existing HOLDs remain. #270 stays OPEN.
