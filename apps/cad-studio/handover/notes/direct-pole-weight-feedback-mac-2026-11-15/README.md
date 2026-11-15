# D1386 — Direct pole weight feedback

Completes #164. A specialized Weight field keeps an invalid uncommitted draft visible and marks it invalid with associated local feedback: Enter a positive weight. Not applied; saved weight is N. Enter and blur reject empty, nonfinite, zero and negative values without editing geometry. Positive edits retain the native guard. Escape restores the saved value. Object/pole ownership and direct revision reset stale drafts; stable rerenders do not. Generic numeric fields and kernel admission remain unchanged.

## Verification

- Node 22.19.0: 9/9 focused pole-weight and adjacent Direct-crossing tests PASS. Covers invalid/valid drafts, Escape followed by blur, shared curve/surface keys, native guard, revision/owner resets and immutable source.
- Targeted ESLint, Studio TypeScript, production build and diff check PASS.
- Actual Chrome WebGPU at 1024×800 and 1440×900 PASS for both surface and curve controls. 0+Enter and −1+Tab retain draft text, expose aria-invalid and linked condition/not-applied/saved-value text, and leave native weights/points/document unchanged. Weight 2 clears the error; Undo/Redo restore weights and points. Native Save/fresh Open preserves valid edits.
- Independent rational midpoint checks: surface U2/V4 changes [30,9,3] to [26,6,3]; shared degree-1 curve midpoint changes [6,3,0] to [4,2,0].
- Invalid input and associated message fit together in the inspector after explicit scrolling; all eight invalid cases have viewport-bounds assertions. Screenshots at both widths visually reviewed.

Final receipt: `/tmp/d1310-publish.1Wqzsz/d1386-second/receipt.json`, SHA256 `9fd0abffec3d950abf7a46c56206f60f6075bd268930ce16302e732978039fe9`. Build log: `d1386-build.log` in the same parent directory.

First run also passed functional checks (receipt `446d8da5a1b3a39e3df75ee08b62df008fb7c1f90f1a46dd4e66fb9ad21761cd`), but a first Enter screenshot placed the input at the viewport bottom and the message below it. The second run adds explicit inspector scrolling and simultaneous-visibility assertions; product is unchanged. Automatic error scrolling is not implemented or claimed. No screen-reader/full-suite claim. Existing unrelated App lint baseline, docs/inventory drift and HOLDs remain; CI is not awaited under the owner instruction.
