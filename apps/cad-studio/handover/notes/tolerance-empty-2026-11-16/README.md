# Explicit tolerance input values and units (#35 partial)

Blank numeric tolerance input is no longer coerced by Number('') into zero. It retains the prior authored value, restores that value in the field, and explains that zero must be entered explicitly. Successful valid input clears that local validation message.

Numeric fields visibly identify their authored units: mm for length/diameter, degrees for angle. This does not change document units or reinterpret values on an inch sheet. Accessible descriptions explain that millimetres remain the input unit when the sheet displays inches.

Validation:
- Changed component lint and Studio typecheck/build pass.
- New frozen Chrome WebGPU flow at 1024/1440: lower -0.254 mm, switch sheet to inch, empty Lower refuses without document change, explicit 0 commits, Undo/Redo and Save/Open pass. `blank-rejected-1024` visually reviewed. Artifacts: `/tmp/cad-tolerance-empty-20261116`.
- Existing drawing-tolerance-selection browser passes both widths, including blur ownership/selection and local project Save. Artifacts: `/tmp/cad-tolerance-selection-20261116`.

Remaining #35: diameter symmetric rounding and fit-table/grade precedence audit; PDF consistency not requalified here. No ASME/PDF HOLD scope changed. #35 and its #44 entry remain open. Protected #126 WIP unchanged.
