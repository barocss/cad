# Fillet negative end-radius validation (#76)

## Change

- The model Fillet command rejects negative and nonfinite end radii before choosing constant/varying construction. Previously the `r1 > 0` branch let negative input silently fall through to Constant.
- Studio's shared numeric rule now marks End radius invalid, provides adjacent `0 mm or greater · use 0 for the same radius` guidance and lets the existing preview validation disable Apply. No preview-state implementation was changed.
- Exact zero keeps the established same-radius scalar behavior. Positive/equal endpoints retain authored varying controls; the kernel, file schema and History setters are unchanged.

## Verification

- Actual Chrome WebGPU, 1024×800 and 1440×900: negative −2 refused on each of three creation flows; Apply disabled, `aria-invalid` set, document unchanged; recovery to positive/equal/zero accepted. Screenshots reviewed at both sizes.
- Existing equal-endpoint driver additionally verifies History endpoint edits, Undo/Redo, real Save and fresh Open, strict native B-rep, eight axial section samples and independent Python radius-squared volume integral at both sizes. PASS.
- Model `fillet-equal-endpoint-mode` and `api-variable-fillet`: 12/12 PASS. Covers negative subnormal, −2, NaN and infinities; the old test explicitly preserving #76's fallback was replaced with the required rejection contract.
- Studio `fillet-end-radius-number`: 1/1 PASS.
- Changed-source/test ESLint: PASS. Studio TypeScript/Vite build: PASS.

## Limits

The browser fixture is one original straight convex edge of a 30×12×20 mm box. No new closed-chain, curved-edge, kernel, accessibility-device or History-negative-input qualification is claimed. No deployment. Existing #126 WIP and all HOLD scope untouched.
