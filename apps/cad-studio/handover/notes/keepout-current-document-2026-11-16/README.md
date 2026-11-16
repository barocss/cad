# Keep-out verdict ownership (#28)

## Reproduced risk

Replacing a clear document with an intersecting document that reused keep-out ID K1 left the previous green `clear` verdict on the new geometry. Frozen-source actual Chrome observed 34 stale-clear animation frames before the new check completed. This takes priority over connector breadth work under the P0 current-result rule.

## Change

A keep-out verdict now carries the exact evaluated document, references, body array and engine identities that produced it. Rendering exposes it only for those identities while geometry is fresh and not busy. A live owner check also rejects retired asynchronous completion. During a transition the existing unknown indicator is shown instead of a previous verdict. The existing effect cleanup and 350 ms debounce remain.

The source and receipt helpers own only result admission. No geometry, tolerance, kernel intersection, keep-out placement, preview evaluation, or document commit behavior changed. Verdicts remain checks of accepted geometry, not active-command preview geometry.

## Verification

- Baseline actual Chrome: 34 old-clear frames on the replacement intersecting document.
- After: 0 stale-clear frames; reverse intersecting → clear replacement also had 0 stale-failure frames. Both settled verdicts were correct, source documents remained exact, and no browser errors or downloads occurred. Result screenshot reviewed.
- Focused helper tests: 3/3, covering exact-source admission, each changed identity, busy/not-fresh, same-content replacement, and deferred completion admission. These are helper unit tests, not a hook mounting test.
- Studio TypeScript and targeted lint passed. Production build passed in 4.03 s. Existing bundler warnings remain; no new CI job was added.
- Browser driver: `test/keepout-current-document-browser.mjs`, `KEEPOUT_CURRENT_FROZEN=1`; baseline uses `--repro`. Local receipts preserve the sampled frames and source hashes.

Existing WIP and HOLD scopes were untouched. #28 remains open for remaining connector placement and flat-pin protrusion guidance. The pin creation label currently says `Length (0: flush)` although kernel default length is the shaft step diameter with flat ends; this is a separate follow-up, not changed here.
