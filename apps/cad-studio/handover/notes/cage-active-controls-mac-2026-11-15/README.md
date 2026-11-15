# D1325 — Visible cage Pick/Show active controls (#556)

## Bounded change

`CagePanel` uses the existing theme accent/ink for selected Vertex/Edge/Face and Box/Smooth buttons, rather than relying on the ineffective on class. A separate focus-visible outline distinguishes keyboard focus from active state. Front/Back shares the same style constants. No handlers, geometry or mode state changed; no new explanation area.

## Independent Mac verification

- Studio type-check, focused lint, production build, diff check and independent review PASS.
- Actual96-face public box at1024×900 and1440×900: all twelve Pick×Show combinations retain exactly one aria-pressed active button in each group, distinct computed background/text colors with pointer and focus moved away, actual mode alignment, exact cage/document preservation and zero cage Undo steps.
- Keyboard Tab focuses inactive Edge while Vertex stays active; separate solid2px focus outline verified. Screenshots of unfocused active states and independent keyboard focus visually reviewed.
- Cancel and native Save/fresh Open preserve the original document. Frozen receipt SHA256 `a44581bcb1d83a82f07964fd9e4d717cb4b88f7156bee32f2bd478bf2ced2bb8`.

## Limits / next

Current dark theme only; light/high-contrast theme, formal contrast compliance, AT/mobile and full suites NOT_RUN. This driver starts with empty selection; nonempty selection preservation is covered by D1324, not newly claimed here. Depth controls share style but are not directly re-exercised in this driver. Existing generated-doc drift and unrelated App lint remain separate; CI not awaited. All HOLDs persist. Next D1326/#557: keep an unevaluable zero-displacement cage extrusion draft open instead of committing it at Done, with valid moved-extrusion recovery.
