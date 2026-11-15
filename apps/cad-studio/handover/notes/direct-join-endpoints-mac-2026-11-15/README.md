# D1389 — Direct Join endpoint guidance

Completes #497 at the tested desktop scope. The existing two-curve controls identify the first curve end and second curve start by name/ID and full-precision authored XYZ, plus their Euclidean gap. When those endpoints differ but the opposite order matches exactly, the local group directs the user to the existing explicit Swap curve order action. No automatic swap, reverse, snap or geometry edit occurs. Exact endpoint equality is necessary, not a promise that other native Join gates pass.

## Sources

- `src/ui/joinEndpointGuidance.ts`: read-only current native/clamped endpoint poles, finite gap, exact per-axis numeric equality matching native Join. Invalid or ambiguous references yield unavailable guidance.
- `src/ui/TwoCurveRoles.tsx`: compact named Join endpoints group and explicit recovery; raw numeric strings avoid rounding a tiny mismatch to zero.
- `src/ui/DirectPanel.tsx`: links the existing Join button to the group; handler and admission stay unchanged.
- `test/join-endpoint-guidance.test.ts` and `test/direct-join-endpoints-browser.mjs` retain refusal and lifecycle evidence.

## Verification

Node 22.19.0: 9/9 Join, roles and adjacent ruled focused tests PASS, targeted ESLint, Studio TypeScript and production build PASS. Focused coverage includes the 5 mm mismatch, moved reverse order 30 mm gap, explicit Swap and exact equality; tiny 1e-12/Z mismatch with native refusal; rational/nonuniform domains and signed zero; unequal-degree exact endpoints without a success promise; missing/ambiguous/broken sources.

Actual Chrome first run PASS at 1024×800 and 1440×900. Both gap5 and gap30 refusals preserve document and selection. Move B by Y−5 is a separate undoable edit. Explicit Swap changes only order and shows gap0. Join retains hidden originals and creates a native curve with endpoints [10,10,0] and [40,10,0]; independent straight sampled segment length is 30 mm. Move and Join Undo/Redo, native Save/fresh Open and exact native proof PASS. Six gap/refusal/swapped screenshots reviewed: endpoint identity, coordinates, gap, recovery and Join are readable. No source changes or browser errors; clean shutdown.

Receipt `d1389-first/receipt.json`: SHA256 `521c6bb4233661f68e0cd1a42ca02194df1bce04d5a5e2460505f45abe27705e`. Evidence retained locally outside the repository.

Browser inputs are authored equivalent degree1 curves at the issue coordinates, not a fresh Make curves qualification. Arbitrary free curves and assistive technology are not browser-qualified. Native Join gates and HOLDs remain unchanged. Existing unrelated App lint and aggregate documentation drift are separate; no full-suite claim.
