# Point Shadow limit recovery (#75)

Shadow-toggle failures now appear by the attempted checkbox with aria-invalid/describedby rather than a duplicate panel-top error. A conflicting Point light is identified by its actual visible list number, with instructions to turn its Shadow off before enabling the new light. Existing full-candidate validator remains authoritative. Error state clears on accepted light changes/Undo/removal, avoiding stale index associations. General limits are available in a collapsed disclosure.

Shadow-radius copy distinguishes an unset/default radius from a saved numeric radius, including saved zero. No stored-data or GPU-budget change.

## Verification

- Chrome WebGPU at 1024×900 and 1440×900: PASS. Two default Suns + two Points; default and saved-2-mm conflict via keyboard Space; attempted checkbox remains off and focused, error is associated and unique, document unchanged. Turn off Point 3 then enable Point 4; Undo/Redo; native Save/fresh Open; repeated conflict after reopen and removing the active light clear stale errors while retaining radius 2.
- 1024 also exercises the same settings refusal with Path tracing selected, without starting a tracing session.
- Unit hint/mutation gate/renderer-consumer tests: 6/6 PASS. Changed-file lint and Studio type-check/build PASS.
- Narrow and wide error screenshots reviewed.

Initial browser assertions were corrected for existing false-shadow omission on Undo and native Render key reordering on Open. Saved/reopened objects were semantically equal; final test uses deep semantic equality rather than key-order equality. No production mutation was made to accommodate those serialization details.

## Limits

No rendered shadow-pixel correctness or actual path-tracing run; no browser coverage for other light-budget limits or assistive devices. Unit helper covers first-eight Point numbering/budget boundary. Existing #126 WIP remains untouched.
