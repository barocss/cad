# Locate a picked edge before removing it

[P1 part editing, issue #740](https://github.com/barocss/cad/issues/740). In a new Edge Fillet, open **Edit picked edges** and hover a row or move to it with Tab. The pink stroke marks that original straight edge. The row's Remove button is a separate action.

The row owns its command context, document and evaluation. The viewport draws the original displayed line segments with its current camera, including while a Fillet preview is pending. A merged straight edge keeps its actual segments and gaps. Curves and unavailable sources have no straight location. Cancelling, removing the picked edge, or leaving the list with both pointer and keyboard focus clears the mark.

## Desktop Studio

| Test | Verified result |
| --- | --- |
| 40 × 30 × 10 mm box | Hover and keyboard focus identified the 40 mm edges at Z = 10 and Z = 0. Fifteen comparisons between visible SVG strokes and projected original endpoints had a maximum error of 0.000019 CSS pixels. |
| Radius update | The test held one unmodified successful Worker reply. Both rows selected the correct location during the busy state. A keyboard-focused row retained the correct location after delivery. Inspecting a row preserved the authored document, direct selection, radius, scope and Undo/Redo state. |
| Replace and clear | Closing and reopening the list cleared the mark. Remove kept only the bottom seed. Apply at R2 produced a valid solid of 11,965.663706 mm³. Undo, Redo, Cancel and switching to Chamfer kept unrelated views clear. An edge at ordinal 2 in a second document resolved at X = 12…52 mm instead of the original 0…40 mm. |
| Automatic tangent edges | On a stadium prism with two direct picks and six added tangent edges, only the top straight seed received the location stroke. Removing that seed and applying R1.5 stored one bottom pick and produced four native bottom targets. The reopened solid measured 1,231.159783 mm³. |

Twelve focused tests passed, including ownership changes, non-straight edges and disconnected constituent segments. Studio type checking and the production build passed. The desktop runs used the installed Chrome and real Studio Worker. The timing control delayed delivery of a result, without modifying geometry or verdicts. History Fillet, curved-edge location and mobile are outside this feature.

## Reproduce

Use Node 22.19.0, the existing desktop CHROME and PW_DIR, and a separate fresh external output directory for each browser command. Use the heavy gate for each command and freeze the checkout during the browser runs.

```sh
pnpm --filter @barocss/cad-studio-app test fillet-picked-edge-highlight fillet-pick-failure interior-fillet-picked-feedback
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
FILLET_PICKED_EDGE_HIGHLIGHT_SOURCE_FROZEN=1 node test/fillet-picked-edge-highlight-browser.mjs "$BOX_OUT"
FILLET_REMOVE_SEED_CHAIN_SOURCE_FROZEN=1 node test/fillet-remove-seed-chain-browser.mjs "$CHAIN_OUT"
```
