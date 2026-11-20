# Independent Extrude can suggest one named Join target

P5, [issue #739](https://github.com/barocss/cad/issues/739). In Model, a new Extrude from a single unanchored rectangular XY sketch starts as **New body**. For a positive fixed distance and zero draft, Studio offers a named Join after the native intersection with the single visible, supported upright solid exceeds 0.000001 mm³. Selecting the suggestion is an explicit action. The Union uses the existing stock and extrusion references.

If a depth edit loses overlap, the selected target remains visible as unavailable. Apply and Enter wait for a valid choice. A delayed answer belongs to the original document, target, values and view. An anchored sketch retains its existing operation choices.

## Desktop Studio results

| Scenario | Result |
| --- | --- |
| 20 × 20 × 10 mm stock and a 10 × 10 mm sketch at Z = 8, extruded +5 mm | Native intersection 200 mm³. The suggestion leaves the document and history unchanged. New produces two closed solids of 4,000 and 500 mm³. |
| Select Join with the keyboard | One closed solid of 4,300 mm³. Undo restores the 4,000 mm³ stock. Redo and Save followed by fresh Open restore the same Union and native volume. |
| Z = 10 and Z = 11 | Coplanar contact and the 1 mm gap both give an empty native intersection. Neither offers Join. |
| Hidden stock or two current solids | Neither offers a target. |
| Sketch at Z = −2, change distance from +5 to +1 mm | The explicit Join remains selected but unavailable. Enter cannot commit it. Selecting New and restoring +5 mm keeps New selected when the native reply arrives. |
| Delayed successful reply after another depth edit or Cancel | The harness delayed delivery of the actual worker response. The accepted document and history stayed unchanged. |
| Face-anchored rectangle | The default Join produces one closed 4,500 mm³ solid. |

The Studio command application module now owns the Apply readiness checks and the Enter and Shift-Enter queue. The App connects those decisions to the document, focus and preview. App.tsx was 4,119 lines at the parent revision and is 4,112 lines with this feature. Keep future feature rules with the command that owns them. The next useful split is sketch launch inside the command start handler, where source selection, plane resolution and camera setup can be tested together.

## Reproduction

Use the installed Node 22.19.0, desktop Chrome and Playwright. Run each heavy step through the repository gate. Set the output variables below to separate directories outside the checkout.

```sh
pnpm --filter @barocss/cad-model test independent-extrude-join interference-volume face-end-extrude region-extrude extrude-draft-binding face-commands
pnpm --filter @barocss/cad-studio-app test command-apply-queue command-hud-actions extrude-end-face-pick
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
EXTRUDE_JOIN_SOURCE_FROZEN=1 node test/extrude-join-suggestion-browser.mjs "$JOIN_OUT"
D845_SOURCE_FROZEN=1 node test/extrude-end-face-preview-ownership-browser.mjs "$QUEUE_OUT"
```

**PASS** — 47 model checks, 13 Studio checks, Studio production build including type check, lint on changed source and tests, and both desktop Chrome flows. The second flow exercises a queued Enter on another Extrude mode. It covers unchanged input, a new end face, Cancel and opening a different document with reused IDs. The harness explicitly confirmed the current discard dialog before opening the replacement.

**FAIL** — The global documentation checker reports a stale refusal table and a core API inventory mismatch (44 expected members, 46 in source). Both diagnostics were present on the clean parent before this feature. The reviewed inventory change for this feature adds two optional command-context members and six exports.

**NOT_RUN** — Mobile and other modeling commands. The checked scopes do not establish overall CAD readiness.
