# Mate selection priority (#61)

## Change

`src/ui/MatePanel.tsx` shows Stays/Moves and the current refusal before the optional reference pickers and help. Cylindrical/Universal freedom stays short; existing connector-limit and robot implementation caveats remain available in native keyboard-operable `Mate selection help`. Starting a draft scrolls it into view without changing focus or scrolling again on each pick. Existing mate solver and motion code are unchanged.

## Verification

- Production TypeScript/Vite build PASS (`/tmp/cad-mate-priority-build-final.log`).
- Changed component and browser test ESLint PASS.
- `test/mate-selection-priority-browser.mjs`, `MATE_SELECTION_FROZEN=1`: PASS at 1024×800 and 1440×900 (`/tmp/cad-mate-priority-r4-20261116`). Actual edit-in-place fixture; initial Stays/Moves bounding boxes inside viewport; short Cylindrical freedom; Enter expands/collapses help; Cancel preserves document; repeated Add mate; Coincident first Base top retained after Base bottom refusal; one refusal owner; keyboard Cube bottom selection commits one mate; Undo restores entire initial document. Screenshots captured and narrow refusal/wide Cylindrical layout visually reviewed.
- Earlier driver incorrectly called the document object as a function; corrected. The next pass exposed a real 1440 viewport visibility failure; draft-start scroll fixed it. Final repeated flow passed both viewports.

## Scope

Native reference-picker pointer and keyboard paths only; no new viewport-hit qualification, cylindrical connector geometry, robot motion, assistive-technology or full aggregate-suite claim. No protected #126 work staged or edited.
