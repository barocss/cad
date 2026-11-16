# Datum target placement guidance (#108)

Idle target controls no longer show placement paragraphs. Collapsed, keyboard-operable Kind help explains that point targets follow a straight edge endpoint, while line/area targets use fixed view points and do not follow geometry. The active canvas status requests only the selected kind's first action. Existing next-end, symbol placement, invalid-input and overlapping-endpoint recovery messages keep precedence. Target creation, resolution and serialization logic are unchanged.

Chrome WebGPU PASS at 1440x900 and 1024x900: collapsed/expanded Kind help, absence of idle paragraphs, point activation/cancel, circular area placement, line first/second endpoints, same-point refusal with unchanged document, recovery to another endpoint, symbol placement, Undo/Redo, Save/fresh Open and SVG export. Existing independent Python oracle confirms stored coordinates, circle diameter, phantom line/area, hatch containment and split symbols. The 1024px resulting-target screenshot was inspected.

Studio TypeScript/build PASS. Editor and browser-driver ESLint PASS. DrawingWorkspace retains five pre-existing unused-variable errors (DrawingFix, _sig, _was, _leader, _sheet), reproduced identically against the pre-change HEAD; no new lint error.

Run `DATUM_TARGET_KINDS_SOURCE_FROZEN=1 ... node apps/cad-studio/test/datum-target-kinds-browser.mjs OUTPUT WIDTH` with Chrome/Playwright configured as described in the driver. Point creation/overlap recovery and Section/Detail recovery were not requalified in this run; their handlers were not changed. Rectangle targets, assistive technology, PDF/DXF and full repository suite NOT_RUN. This does not resolve the distinct overlapping-candidate identification issue #109.
