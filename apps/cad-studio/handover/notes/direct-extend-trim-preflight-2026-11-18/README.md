# #29: trimmed Extend preflight (partial)

This changes only Studio Extend admission and guidance. The engine already refused trimmed sources without changing the document. It does not add trimmed Extend support or automatically Untrim. Existing #29 remains OPEN.

## Evidence

Synthetic outside-hole surface from the committed D341 fixture. No user document, credentials, or personal metadata is included.

- Baseline: trimmed Extend was enabled without preflight. Clicking produced the existing DIRECT_VALUE refusal; full document, dirty state, visible History and Undo/Redo availability stayed unchanged.
- Actual: nonempty trims disable Extend, with an accessible explanation. Invalid distance and trim explanations compose. Explicit Untrim removes only the selected trims; whole-surface Extend then succeeds. Original source strings, other objects, nodes and outputs remain. Undo/Redo restores each document and the original trims.
- Whole admission: undefined and empty trim arrays remain permitted. Malformed trim metadata follows the existing core refusal boundary; malformed native files are not claimed supported.
- Studio dedicated/related unit tests: 9/9 PASS. Model existing Extend-plane/trim-guard tests: 30/30 PASS. Studio type check and scoped lint PASS.
- Existing Extend draft actual regression PASS, including its affine 2.5-distance endpoint oracle and selection/Undo draft reset. This is not general geometry certification.
- Both actual browser runs closed context, browser and server. Runtime/console/source-change errors: zero.

## Limits

The new trim fixture does not independently certify extended geometry accuracy, arbitrary curved surfaces, or native Save/fresh Open. These remain NOT_RUN. Unit UI-handler tests use a controlled hook scheduler and do not execute geometry; actual browser results are separate. No new schema, Model behavior, Split/Region/Thicken semantics or automatic data cleanup.

Baseline and check01 completed first pass. During static review, a reported regex issue was an escaped tool-output reading error; byte inspection confirmed the original fixture was correct, so no test was weakened or changed.

Tests ran before the disjoint #21 main update 438b7072ba39b278b0d9334f9f7c88c2b2f17422. Post-integration focused tests, public PNG rendering and exact-commit CI are tracked in the issue comment; not claimed by this pre-push record. Full repository suite was not run.
