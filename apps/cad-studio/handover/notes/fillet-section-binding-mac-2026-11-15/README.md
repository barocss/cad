# D1409 — Fillet section binding controls (partial)

Issue #122 stays OPEN. Only unsupported Conic Rho / G2 Tension parameter selectors are removed by an exception in the generic History binding wrapper. Direct numeric section values and supported Radius binding remain unchanged. The field-local actual-range requirement is not implemented here; it is the separate #121 follow-up. No schema or native parameter support is added.

## Verified binding-only scope

- Focused Model tests 19/19, Model/Studio type checks, owned lint, driver syntax, diff check and production build PASS.
- Actual isolated Chrome: 1024×800 and 1440×900, each with Conic and G2. Numeric section0.4→0.7 applies; unsupported section selector is absent; Radius binding remains; Undo/Redo and Save/fresh Open preserve exact document data and native digest.
- Strict B-rep and bound-versus-explicit numeric native equality PASS. Independent rational-conic numerical integration expects 11953.18340315294 mm³ versus native 11953.183403113646. Exact quartic Bernstein section integration for G2 expects 11962.331428571428 versus native 11962.331428571448. Volume acceptance is 5e-6 mm³; native section samples have maximum residual 5.685e-13 mm against a 1e-7 mm limit.
- Conic digest `7fa38157d735bf92630359ab83f74be80a911e45c5078bc7f23cdddfd4427927`; G2 digest `ef241343b8a2ac5e04102f82dae02526c983c2cb6829086049dfb96c88648c42`. Both match numeric, bound and reopened forms at both widths.
- Root inspected 1024 Conic and 1440 G2 reopened screenshots. This does not qualify display tessellation or claim a rendering fix.
- Local receipt `d1409-first/receipt.json` SHA256 `6a7d83afc350bdfeafe27a540b96e66a83707da7ba06d65c9193341a1c9bf457`: PASS, no source changes/browser/console errors, all eight contexts/browser/server closed.

Limits: a single straight convex R4 edge on a 40×30×10 box, section setting0.7. No general continuity, assistive-technology, mobile or CI claim. Range input0/1 and small valid values remain for #121. Existing Drawing baseline failures, #613 overlaps and HOLDs are unchanged. Evidence is local, not a public artifact link.
