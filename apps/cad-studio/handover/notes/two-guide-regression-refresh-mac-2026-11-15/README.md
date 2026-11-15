# D1366 — Two-guide Loft regression expectation refresh

Base `ab04544b7cf6859fe7625b5a287bf3cb15fbab3f`.

Independent UI QA found the older two-guide browser driver still waiting for the generic endpoint-failure title. Current UI already provides the more precise Guide 2 corner requirement. The driver now waits for that exact current message and additionally verifies the Second guide field is aria-invalid. No product source changes, no new issue and no claim of a newly fixed product defect.

Actual Chrome full `loft-two-guides-browser.mjs --check-hidden` PASS: hidden single/two-guide discovery, endpoint refusal, accepted creation, touching-guide refusal with both X inputs associated, independent guide edits, Undo/Redo, downloaded Save/fresh Open and existing native/independent geometry checks. Reviewed actual endpoint-refusal screenshot for readable current text and disabled Apply. Frozen-source receipt `d1366-first/receipt.json` SHA256 `fe99fcb700f6ffbaab894c4a17707d10a765dbc8c6278ae268a92a980800e67b`. JavaScript syntax and diff checks PASS.

No redundant product build was run for this test-only change; previous D1365 build remains the unchanged product baseline. This is one desktop viewport and the existing bounded congruent-profile/two-quadratic-guide suite, not all Loft cases. API inventory drift remains as documented in D1365. Continue D1367 remaining #22 Draft feedback assessment; umbrella remains open.
