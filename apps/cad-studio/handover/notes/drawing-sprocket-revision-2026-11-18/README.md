# #722: issued sprocket drawing tracks chain geometry

Base badf44ade2743730b89865fc66e01b1318a39e90. Scope: active standalone sprocket, not all drive kinds or a manufacturing certificate.

Actual default Part:base drawing of a manufactured sprocket, issued as A. Library Drive rows file updates chain pitch12.7→12.8 without changing nodes. Volume changes 21697.229985369377→22065.282702881625 mm³ and actual SVG view paths change. Before the fix, issued stamp remains current. After the fix, the out-of-date message appears; Undo/Redo, native Save/fresh Open and explicit Next revision B all pass.

Only chain pitch and, when the node leaves seat diameter implicit, roller diameter enter the new fingerprint. With an explicit seat, **valid-range** roller edits do not change geometry; invalid rows can still be refused by the kernel. This marker does not certify validity. Unused rows, citations, innerWidth/plateHeight, suppressed consumers and report-only fields are excluded. Last-row lookup and mixed implicit/explicit consumers match evaluation.

Ordinary legacy stamps remain exact. Existing sprocket-backed node-only stamps are preserved in saved files but cannot certify the new row dependency; explicit reissue is required. No saved issue history is automatically rewritten. Existing assembly semantic stamps are untouched.

Validation:
- Frozen Chrome baseline expected FAIL; fixed PASS, actual paths changed and stale indicator1. Screenshots directly inspected.
- Focused5/5; selected prior revision/recovery regressions93/93 PASS.
- Model/Studio TypeScript and owned-file ESLint PASS.
- No browser-time source changes; all contexts/browser/server closed.
- Independent read-only review: no blockers.

Harness notes: initial native unit fixture compared raw source key order with normalized Open data; corrected to issue a normalized document, preserving the existing legacy policy. First broad regression selection from repository cwd got92/93: `eco` also selected project-recovery-warning, which expects app cwd and failed ENOENT. Same selection from apps/cad-studio passed93/93 without product changes. No failed run is counted as a product pass.

Public image byte equality and GitHub rendering are separate checks, recorded on the issue.
