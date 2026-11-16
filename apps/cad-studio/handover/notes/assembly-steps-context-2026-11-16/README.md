# Assembly Steps visible context (#64)

Expanded Steps now shows position only between navigation buttons; collapsed Steps retains the header position. DockSection's new opt-in preserves all other sections' existing summaries. Selecting an unassigned part explains whether it is hidden, faded, or shown at the final step and points to Add selected. Details states a notice count rather than an unexplained dot, while preserving model problem text, Note and Fade. General display-only help no longer repeats the unassigned-part rule.

Verification:
- `assembly-steps` unit tests 8/8 PASS, including missing-part and nested-selection rules.
- Extended actual `assembly-steps-browser.mjs` PASS at 1024×800 and 1440×900 (`/tmp/cad-steps-context-r2-20261116`). Checks expanded/collapsed summary, Go to its step, hidden Cap without gizmo, keyboard Details, faded/hidden/last-step messages, navigation/Fade document immutability, Cap assignment, preserved instances/base/mates, Undo/Redo, actual Save and fresh Open.
- Existing full browser driver also passes three-step creation, explode/capture view, navigation, protected removal refusal, save/open and Close restoration, with independent Python presentation-only document oracle.
- Narrow screenshot visually reviewed. Singular notice copy polished after first successful run and full driver rerun.

Scope: presentation UI only. Missing-part model behavior is unit-tested, not newly browser-qualified. No assistive technology or full aggregate-suite claim; no #126 WIP changed.

Final production TypeScript/Vite build PASS (`/tmp/cad-steps-context-build-final.log`); all three changed code/test files ESLint PASS.
