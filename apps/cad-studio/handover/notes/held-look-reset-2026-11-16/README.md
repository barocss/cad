# Held appearance reset (#38, partial)

A saved override can now be explicitly reset even when the referenced body or nested part no longer exists. Only the exact saved occurrence/key is removed; setting a missing target is still refused, and pattern-driven reset restrictions remain. No automatic cleanup or reassignment occurs.

Appearance Details provides `Reset held appearance` for each held key; the control removes all its saved fields, not the shared definition or other occurrences. Pattern-driven controls remain disabled.

Validation:
- Model held-summary/reset tests: 2/2 pass (field reset, all-fields reset, missing nested path, occurrence isolation, immutability, nonexistent-target refusals).
- Existing model instance-looks: 26/26 pass; Studio instance-looks UI: 9/9 pass.
- Focused changed core/UI lint and Studio typecheck/build pass.
- Frozen Chrome WebGPU browser at 1024 and 1440: duplicate warning count, revision dismissal preserving settings, selected occurrence reset of hidden/color/material/face overrides together, Undo/Redo, Save/Open, and other occurrence preservation pass.
- Browser artifact: `/tmp/cad-held-reset-r2-20261116`; reset-1024 screenshot visually reviewed.

Limits: #38 stays open. Delayed revision evaluation/error recovery, simultaneous failing occurrences and WebGL2 revision flows are not established by this test. #44's #38 item remains unchecked. Protected #126 WIP was neither edited nor staged.
