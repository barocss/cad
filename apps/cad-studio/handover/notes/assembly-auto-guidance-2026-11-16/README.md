# Assembly Auto-dimension guidance (#107)

The repeated scope paragraph is removed. An assembly-only reason sits directly below Auto: `Auto-dimension needs a part scope.` The Auto button references that reason with aria-describedby and is aria-disabled but keyboard-focusable once projection is ready. Its click handler guards assembly scope, so Enter/Space cannot run Auto. Other readiness checks retain native disabled behavior. Part-scope Auto remains active. BOM/balloon controls and later-sheet management guidance are untouched.

Chrome checks at 1440x900 and 1024x900 PASS: Sheet 1 → Continuation → Sheet 1, reason/description association, keyboard focus and Enter/Space no-op with exact document preservation, BOM control on Sheet 1 only and balloons off. Switching to part scope removes the restriction and keyboard Auto creates dimensions. 1024px continuation screenshot reviewed. Changed-file ESLint and Studio build/typecheck pass.

Driver: `ASSEMBLY_AUTO_FROZEN=1 ... node apps/cad-studio/test/drawing-assembly-auto-guidance-browser.mjs OUTPUT WIDTH`. The first test attempt failed only on JSON key-order equality after loading; corrected by checking deep equality then retaining the normalized document for no-op assertions.

Limits: synthetic assembly with BOM/balloons off; printing, enabled BOM/balloon output, screen-reader execution, other browsers and full suites not run.
