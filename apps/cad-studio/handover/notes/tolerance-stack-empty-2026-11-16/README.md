# Tolerance stack prerequisite guidance (#105)

With a completed projection and fewer than two linear dimensions, the stack panel replaces empty selectors and Add term with one next step: add two linear dimensions, or one more, with tolerances on the same view axis. The normal stack UI returns at two linear candidates. Existing validation still checks independence, axis, references and tolerances; the prerequisite does not claim that any two dimensions form a valid stack. Closing the details hides the guidance. Analysis state and calculation logic are unchanged.

Chrome full-flow PASS at 1440x900 and 1024x900: zero and one linear dimension show the appropriate guidance with no selectors; closing hides it. Exactly two dimensions show selectors and calculate a 29.85 mm minimum. Three-term Decimal oracle, duplicate rejection, keyboard removal, mm/inch and dual-unit transitions, tolerance Undo, removal confirmation, reused-ID refusal, native save/reopen and missing occurrence checks pass. Changed-file ESLint and Studio TypeScript/build pass.

Driver: `D1256_SOURCE_FROZEN=1 ... node apps/cad-studio/test/drawing-tolerance-stack-browser.mjs OUTPUT WIDTH`. Curved-dimension-only browser fixture, screen-reader execution, other browsers and full repository suite not run.
