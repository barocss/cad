# D1315 — Refuse incomplete Direct Sew tolerance input

Addresses barocss/cad#544. Keep the typed text until valid rather than silently retaining the previous scalar. Blank, negative and nonfinite inputs show a field-linked status and disable Sew; the handler also guards invalid text. Explicit0 still means automatic. Shared NumberField, native Sew tolerance semantics and History inputs remain unchanged.

## Frozen acceptance and results

Original retained moved-dome fixture SHA256 `fa52cc2f0413a6440606be2ca7ffc2862ce691c348f434bccc606870c908aeac`, six surfaces. Actual Chrome WebGPU1024x800: .019→blank→Tab preserves blank, marks aria-invalid, shows local guidance, disables action; negative also disabled. Explicit0 launches valid automatic preview. .019 refuses and .021 applies; strict native6faces/12edges/8vertices/1solid, volume1200mm³. History .019 refusal and explicit0 recovery preserve semantics; Undo/Redo unchanged. Native Save/fresh Open and reopened strict volume check PASS. Receipt SHA256 `18dc30109aaf3e5973ebd8b97ad83b27dbfe42715d02d7ce9899ad73f2c03850`; source frozen/after/cleanup match, zero browser errors. Screenshot inspected: empty input, explanation and disabled Sew are visible.

Focused combined regression5/5, Studio/Model type-check, focused lint and production build PASS before final driver-only Save/Open addition; final driver lint and Model recheck also PASS. Independent readonly review found no blocker. Initial reused driver ended at Undo/Redo, not Save/Open: the latter was added and actually executed before publication. No numerical tolerance changes.

NOT_RUN: different body, actual assistive-technology speech, mobile and whole suites. Existing generated-doc consistency FAIL remains. Prior manufacturing/dynamics/generic kernel/release HOLDs unchanged.

## Next

D1316 / #545: identify selected trimmed surfaces that block Sew and explain that Untrim restores whole support surfaces, removing openings. Preserve document and selection on refusal; no automatic Untrim.
