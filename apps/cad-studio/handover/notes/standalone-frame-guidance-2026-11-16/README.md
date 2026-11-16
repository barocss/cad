# Standalone frame placement guidance (#106)

The idle placement paragraph is replaced by collapsed Frame help explaining annotation versus measured geometry. Frame view and Add remain available. Add/Move now say to click the sheet and separately identify the owning view. Existing hidden-view saved-position guidance and refusal paths are unchanged; this is not a geometry or serialization change.

Chrome WebGPU PASS at 1440x900 and 1024x900: help toggle, no direct idle paragraph, Front Add/Move hint, Escape preserving the document, placing and moving outside the Front shape, Undo to previous placement and original document. Existing right-view flow passes characteristic/tolerance edits, move, view hide/show with position preservation, Save/fresh Open, SVG export and independent Python frame-position oracle, delete confirmation cancel/confirm and Undo. The 1024px Front placement screenshot was inspected.

The old driver expected immediate removal; it was updated for the existing authored-control deletion confirmation instead of changing product deletion behavior. Editor/driver ESLint and Studio TypeScript/build pass. DrawingWorkspace retains five pre-existing unused-variable lint errors; no unrelated cleanup was included.

Run `STANDALONE_FRAME_SOURCE_FROZEN=1 ... node apps/cad-studio/test/standalone-frame-browser.mjs OUTPUT WIDTH`. Section/Detail frames, drag selection, assistive technology, PDF/DXF and full repository suite NOT_RUN.
