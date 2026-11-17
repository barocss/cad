# Inherited O-ring row removal (#670)

Baseline: main 21145e8bcc1d3ce45df9a91f1644a5971442d147.

The parent O-ring row 214 was removed even though a placed piston gland inherited it. Core effective-child evaluation changed from success to ORING_ROW_UNKNOWN. Actual Library Remove also deleted the row and failed the unchanged-document assertion. The baseline screenshot shows the catalogue after removal; the blank canvas alone is not the defect oracle.

The existing removal guard now follows placed descendants until a local same-ID O-ring row owns the branch. No authored document is rewritten on refusal. Local overrides, unrelated rows, valid replacement and unused deletion retain their contracts. Hidden/suppressed authored references stay protected. Pending revision candidates and other shop-row types are outside scope.

Validation:
- 17/17 focused tests: new inheritance controls, existing gland tests, bearing and bearing-inheritance regression.
- Model TypeScript and changed-file ESLint passed. Read-only review found no blockers.
- Actual Chrome: used row refusal with original unchanged, unused deletion, Undo/Redo, Save/fresh Open and instance-bounds readiness followed by Frame all.
- Viewed protected.png and reopened.png: rejection toast and rendered piston/O-ring retained.
- Frozen source unchanged, page/console errors empty, browser/server closed.

This is focused qualification, not full CAD acceptance. No HOLD/doc-sync changes.
