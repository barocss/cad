# D1361 — Parameter input recovery (Mac)

Base: `56e3fd58c16f8aeb6a39b638263afc38a3ecc2ca`. Resolves #68.

## Bounded change

`ParametersPanel.tsx` uses `newParameterInput.ts` to reject blank/non-finite new values before native insertion, while accepting explicit zero and exact finite precision. Name help matches the existing letter-or-underscore rule. Field-local status, description and focus identify recovery; editing clears that error. The short empty state explains required inputs; keyboard-accessible disclosure retains feature binding help. Existing parameter edits, configurations and native model behavior are unchanged.

## Verification

- Focused tests 3/3, Studio TypeScript, scoped lint and production build passed.
- Actual Chrome at 1024 and 1440: Add and Enter both refuse blank new values without document changes, with numeric focus and linked error. Invalid 3Gap focuses name; _Gap accepts explicit 0. Existing blank edit preserves 0; correction to 5 survives document Undo/Redo and downloaded Save/fresh Open.
- Bound Width=40 fixture retains nodes, configuration and 4000 mm³ volume after rejection and addition of exact 0.123456789012345. Disclosure opens by keyboard. Source frozen across browser run and cleanup.
- Reviewed actual 1024 blank-error and 1440 bound-fixture screenshots: error/readiness and retained model visible. Numeric storage precision is verified programmatically, not inferred from narrow visible field width.
- Browser receipt `d1361-first/receipt.json`, SHA256 `a94381eb8e12708374bb854fb237afcf5af1ddfe82236632939348a7f9634976`, PASS. Receipt visual-review placeholder is supplemented by this subsequent actual image review.

No full-suite, CI, screen-reader or general configuration-workflow acceptance claimed. Existing HOLD boundaries retained. Continue priority #44 open feature-editing items next.
