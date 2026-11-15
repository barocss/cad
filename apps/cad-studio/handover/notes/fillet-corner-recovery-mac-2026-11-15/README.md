# D1414 — Fillet sharp-corner section recovery

## Scope

Completes #124 at the declared recovery scope. The current Fillet must report CAPABILITY with the exact Conic/G2 corner detail, matching feature ID, selected edge and section kind. Only then show “This section cannot turn this corner” / “Try Circular with the same picked edges.” once beside Section, with aria-describedby/invalid. Preserve code/detail in Kernel detail. No automatic section switch, radius/selection/document rewrite, or kernel admission expansion.

Product changes: `src/app/failedFeature.ts`, `src/ui/Hud.tsx`. Tests: `test/fillet-corner-recovery.test.ts`, `test/fillet-corner-hud.test.ts`, `test/fillet-shaped-corner-recovery-browser.mjs` (relative to Studio).

## Verification

- Final focused suite 30/30 PASS; includes the earlier 17 tests, not additive. Real native Conic/G2 boss-foot refusal and Circular recovery; accepted straight-edge controls; exact reason/feature/edge/section and malformed-kind negatives; actual HUD one-notice/ARIA; current revision versus old revision, replaced values, same-ID document replacement and retired preview hook.
- Owned lint, Studio type check, production build, browser syntax/Python AST and diff check PASS.
- Actual Chrome WebGPU 1024×800 and 1440×900 PASS: public four-edge picking, both shaped refusals, disabled Apply/Enter and unchanged radius/selection/document, explicit Circular recovery, delayed error after section switch and after Cancel, Undo/Redo and Save/fresh Open. Code/detail match real Worker replies. Late-after-Cancel is released before reopening; no claim of injection into a new HUD.
- Apply adds existing reference signatures; driver independently checks all four midpoints, axes and lengths, plus unchanged feature/parent/edge/radius semantics. These signatures are not a product change.
- Visually reviewed `1024-g2-refusal.png` and `1440-fresh-open.png`: one Section-local notice with recoverable detail and applied reopened Circular result.

## Independent numerical acceptance

Plate 60×60×10 plus centered rectangular boss 20×12×15: original volume39600 mm³. At z=10+u, 0≤u≤r, outward fill width `d(u)=r−sqrt(r²−(r−u)²)`. Rounded-offset added section area is `64d+πd²`, giving:

`V=39600+64r²(1−π/4)+πr³(5/3−π/2)`.

Six checks at Circular R1 (applied, Redo, fresh Open at both widths): expected39614.035703098 versus native/worker39614.035703091875 mm³, tolerance5e-6 mm³. Strict-valid one closed shell/body. 190557 native trim-used Float64 surface vertices per result, with nonempty four side/four corner interior groups and all three overall height bands. Independent circular implicit residual maximum1.4225924882538266e-8 mm, tolerance2e-6 mm. No triangle-volume or interpolated barycenter oracle. Per-region height-band counts are recorded, not a separate universal coverage assertion. Native digests remain identical across lifecycle checks.

## Evidence and limits

Local `d1414-third/receipt.json` SHA256 `d6c3206fd7e9b298e48939239c7bad0e03b1a1f8932f78d031d3b6026f252a43`; driver SHA256 `f97646eff214ba610111017bbbb14ad7c937fdb9523c5dc296bb988689d79940`. 960 frozen sources, zero changes/page errors/console errors; four contexts, browser and server closed.

First run stopped because the driver read a closed details element; second stopped because its expected applied node omitted existing reference signatures. Both failure artifacts are preserved; fixes changed only the driver. Third run passed unchanged product source.

This is a bounded fixture and UI recovery qualification, not general corner support, continuous error bounds, assistive-technology certification or full CI acceptance. Existing Drawing failures, API inventory drift and HOLDs remain.
