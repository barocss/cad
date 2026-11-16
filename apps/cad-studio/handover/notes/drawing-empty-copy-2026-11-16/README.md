# Empty drawing list instructions (#112)

Removed the repeated usage paragraphs under empty Dimensions and Notes lists. Counts, Auto, authored rows, lost-reference diagnostics and Reattach code remain unchanged. Tool names/shortcuts and explanations remain on the tool rail and keyboard help. Current placement steps remain in the drawing status area.

Real Chrome at 1440x900 and 1024x800 PASS: empty lists contain no repeated paragraphs while counts and Auto remain; focused linear/diameter rail tooltips provide instructions; help lists Angle A and Note N; Escape returns focus to the opener; angle first-edge selection advances to the second-edge prompt; note leader selection advances to text placement; cancellation leaves the document unchanged. The test now waits for asynchronous dialog close-autofocus rather than asserting immediately after the dialog is hidden. Changed-file ESLint and Studio typecheck/build pass.

Driver: `D1250_SOURCE_FROZEN=1 ... node apps/cad-studio/test/keyboard-tool-help-browser.mjs OUTPUT`. Lost-reference/Reattach behavior was preserved by source review, not requalified in this flow. New-user discovery, screen-reader execution, other browsers and full suites were not run.
