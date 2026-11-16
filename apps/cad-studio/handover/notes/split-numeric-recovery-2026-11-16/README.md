# Split numeric recovery (#55)

Base c09acf2a43cf949bc407f5e7dd649630b18ccb7c; 2026-11-16.

Manual Split axis/normal/At edits clear only that command's prior input-pick toast, since the numerical plane supersedes the rejected face pick. Invalid zero normals retain the existing build refusal and disabled Apply, but no longer repeat that error in the Plane step. Valid normals still display the plane equation; axis-face picks keep their face name. Both rejected-face paths now explain Any direction and Normal X/Y/Z plus At as the tilted-plane alternative. No widening of direct face admission.

Validation:
- App TypeScript/Vite build PASS.
- Focused model-command/browser lint PASS; App.tsx retains the previously verified unrelated unused _k lint error.
- Extended oblique-split-history-browser PASS at 1024x900 and 1440x900. Invalid edge triggers the owned pick notice and keeps the document; manual [1,1,0] clears it; [0,0,0] shows one refusal and disables Apply; recovery to X+Y=25.25 restores preview with no stale notice. Actual apply at 30, history edit to 34, Undo/Redo, Save/fresh Open, tangent-plane refusal and scaled [2,2,0]/68 equivalent normal all pass strict native BRep/analytic volume/cap checks.
- Existing split-picked-plane-browser PASS: initial stock-top tangent refusal, reference top name n3.top and exact Z=4.000123456789, actual split, history 4.5, Undo/Redo; strict BRep, cap position, volume and centroid checks.
- Inspected final narrow numeric-recovery screenshot: equation, enabled Apply, no obsolete notice.
- Initial browser attempt incorrectly required the error sentence as an exact standalone text node; the existing display prefixes it with BarocssError/code. Corrected the test to match the sentence within that existing message, then reran both widths.

Evidence: /tmp/cad-split-recovery-r2-1024-20261116, /tmp/cad-split-recovery-r2-1440-20261116, /tmp/cad-split-recovery-picked-20261116.
Limits: recovery regression uses an invalid edge rather than the reported rotated reference side; no new non-axis face-pick, screen-reader/mobile or general topology claim. #126 protected WIP preserved.
