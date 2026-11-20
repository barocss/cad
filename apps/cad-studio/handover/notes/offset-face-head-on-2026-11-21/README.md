# Head-on Offset face launch camera

P5, row 31, [#629](https://github.com/barocss/cad/issues/629). Starting main `3887eccab074dfd00cd0a8a80fa854b7f4af5465`. This is the Studio command-routing slice of the B-rep direct editing issue. It reuses the admitted signed distance handle and the existing Offset face command.

At launch, an available distance handle uses its native face direction. When the forward direction and the normalized handle direction have an absolute dot product above 0.95, Studio chooses an oblique preset. It uses Iso in ordinary cases and Right when the default Iso would also be head-on. Reference-plane mode, picks without a distance handle and existing oblique views keep their camera. The camera selection takes place as the command starts.

## Verification

- Initial desktop measurement on a 20 × 10 × 12 mm tapered box with Draft 15° gave 0.046565 CSS px for 5 mm along the selected cap normal in Top/Ortho. Launching Offset face left the same camera and the admitted +2 mm preview. The handle was nearly a dot.
- The corrected head-on upper cap launch gave 23.982862 CSS px for 1 mm of normal travel. The real mouse moved the handle from +2 to +3 mm. Apply produced one `offset-face` node using `n1.top`. The final cap Z was 15 mm; the other five support planes and all edge and face names matched the original. The independent volume was 1514.4284148501301 mm³ and the evaluated volume was 1514.4284148501306 mm³. Undo, Redo, native Save and fresh Open passed. The reopened strict B-rep had one body and six faces.
- From the lower cap in an existing oblique view, every camera field matched before and after launch. The real lower cap handle could still change +2 to +3 mm. Signed History edits, collapse refusal, invalid-file refusal and native reopen passed in both flows.
- Legacy handle-versus-field parity and the prior hex wall scope passed in actual desktop Studio. All runs recorded zero page errors, console errors and watched file changes. The helper tests also exercise a missing handle, reference-plane mode and a normal aligned with the Iso preset.
- Scoped lint, 19 Studio tests, Studio type check and production build passed. Mobile was not run.

Use Node 22.19.0 and the heavy gate. Use the installed Chrome and Playwright paths and fresh external output directories.

```sh
node apps/cad-studio/scripts/test.mjs offset-face-launch-view gizmo
pnpm build
cd apps/cad-studio
D1254_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$OUTPUT/upper"
D1255_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$OUTPUT/lower" --lower
D898_SOURCE_FROZEN=1 node test/extrude-versus-offset-browser.mjs "$OUTPUT/parity" --handle-parity
D1369_SOURCE_FROZEN=1 node test/hex-wall-scope-recovery-browser.mjs "$OUTPUT/wall"
```
