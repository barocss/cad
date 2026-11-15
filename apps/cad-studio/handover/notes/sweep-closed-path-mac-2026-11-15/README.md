# D1313 — Explain the native closed Sweep path refusal

Issue barocss/cad#153. Private Studio feedback only; no geometry, admission, tolerance or document model changes.

## Frozen acceptance scope

Faceted Sweep, finished circular section, open straight path and closed polygon path. At the exact native closed-path refusal, Path reads `Path is closed. Select an open curve.` once, is not marked done, and generic Undo/feature failure text is suppressed. Apply remains controlled by the original preview result. Other errors and Exact modes are not relabeled.

## Verification

PASS: targeted helper test; independent read-only review. Actual Mac Chrome WebGPU1024x800: open preview → closed refusal → open recovery repeated twice; profile retained and source unchanged. Apply, strict native check, Undo/Redo, native Save/fresh Open passed. Initial closed selection also shows the same guidance; Cancel leaves source unchanged. Final receipt SHA256 `441ddda34b019ab67cec4387f56eab9a870d7edf6490134bb254bc1a5e7fd3e6` with zero page/console errors and unchanged frozen sources. Screenshot inspected: one Path status, incomplete Path marker, disabled Apply; profile remains complete.

The closed polygon exercises sweep-solid.ts's same endpoint-closure refusal as the original R5 circle. R5 rational circle regression also PASS, including repeated replacement, initial closed selection, Cancel and persistence. Receipt SHA256 `2d0b47b0d90b741635ecb4751639a600ccae9c396b903c0398431e51f26d68e8`; screenshot inspected. Final Model/Studio type-check, lint and production build PASS (final circle driver lint and post-driver Model check also PASS). Existing generated-doc drift FAIL remains; full suite/mobile/assistive technology NOT_RUN. All prior HOLDs retained.

## Next

Issue#56: remove contradictory no-editable-dimensions message in Sweep History, preserve path information and make long names accessible at narrow width. Geometry changes and broader display acceptance remain separate.
