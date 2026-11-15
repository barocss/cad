# D1415 — Shell opening-limit recovery

## Scope

Completes #125 for a current appended Shell with an explicit finite-positive numeric Wall. Exact SHELL_REGIONS_SHARP detail must name one temporary extension of the selected planar opening, with matching feature ID, unchanged document prefix, unique source body/ref/key and selection. An existing source face/alias/native member/edge name always wins; collisions are not relabeled. Global errors and native admission remain unchanged.

Show “This opening reaches a Shell limit” and “Cancel Shell, then select another face to open or select the body to try a closed Shell.” Original temporary names, coordinates and code remain in Kernel detail. Wall is not marked invalid; selection and document are not automatically changed.

Product: `src/state/openingShellFailure.ts`, `src/state/useCommandPreview.ts`. Tests: `test/opening-shell-failure.test.ts`, `test/shell-shaped-fillet-opening-recovery-browser.mjs` (Studio-relative).

## Verification

- Focused 30/30 PASS, including nine new tests: actual Top refusal and Bottom/closed strict success, source-name collision, wrong owner/selection/body/detail, decimal/exponent versus hex and stale preview ownership.
- Owned lint, Studio type check, final production build, driver syntax/Python AST and diff check PASS.
- Actual Chrome WebGPU 1024×800 and 1440×900 PASS: Top opening refused with Cancel-first guidance, raw detail preserved, Apply/Enter blocked, Wall2/source/picks unchanged. Clicking Bottom while command is active keeps Top selection; Cancel then Bottom selection recovers. A held real old Top failure cannot overwrite a new Bottom owner.
- Bottom Wall2, History1.5 and separate closed Wall2: Undo/Redo and Save/fresh Open PASS. Authored payload and captured reference signatures checked. Strict native one body; Bottom-open one shell and closed two shells. Eighteen source/result native-oracle checks passed, with lifecycle digest equality.
- Visually reviewed `1024-top-opening-refused.png` and `1440-bottom-fresh-1.5.png`: clear recovery notice and reopened Wall1.5 result. The latter exterior view alone is not evidence of the bottom opening; native checks establish it.

## Independent bounded volume oracle

Authored R4, rho0.5 quadratic has y=r*u², z=20−r*(1−u)². Independent integration gives removed area r²/6, section A=600−r²/6, arc length L=r*(1+asinh(1)/sqrt(2)), perimeter P=100−2r+L. Source volume=40A. With Wall t:

- closed: `40A−(40−2t)*(A−P*t+(3+pi/4)*t²)`;
- bottom-open: `40A−(40−2t)*(A−(P−30)*t+(1+pi/4)*t²)`.

The coefficients account for the remaining sharp right-angle corners and smooth quarter turn. t=1.5,2 is below minimum curvature radius4/sqrt(2); remaining section/length do not collapse. An independent geometry review confirmed these assumptions. Python uses authored constants, not native boundary measurements.

Expected / native volume mm³:
- Bottom2: 7063.724866964487 / 7063.724963867594.
- Bottom1.5: 5444.721606208292 / 5444.72158722086.
- Closed2: 8935.724866964489 / 8935.724963870556.

Relative tolerance1e-7 is about0.00054–0.00089 mm³ for these shells, not a micrometre geometry proof or general Shell accuracy claim.

## Evidence and boundaries

`d1415-third/receipt.json` SHA256 `59269831fd2065df7a50c6482487b16889e85c49f9adfd0c5c68e4992b4d916f`; driver SHA256 `d6d76d857b714a8f6fbfb765b22978bc0bc79ddc3ff5252d7a546eecc8e2730f`. 961 frozen sources, zero changes/page errors/console errors; ten contexts, browser and server closed.

First run clicked an existing Extrude handle at Bottom center; second used Space while the Browser body button had native focus. Preserved failure artifacts led to driver-only fixes: same-face off-center public pick and public Modify→Shell button. Third run passed without product edits.

Parameter-valued Wall and History-rewrite diagnostic mapping are not qualified by this helper. No general G2/Shell support, assistive-technology certification or full CI acceptance is claimed. Existing baseline Drawing failures, API inventory drift and HOLDs remain.
