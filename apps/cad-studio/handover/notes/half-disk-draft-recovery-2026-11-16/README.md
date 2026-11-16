# Half-disk Extrude Draft recovery (#92)

Recognized authored half-disk outward-Draft failures now explain the supported positive inward/zero straight-wall recovery beside Draft. The recognition is deliberately narrow: numeric cardinal diameter endpoints, CCW semicircle, positive distance, negative Draft and the actual non-tangent-joint refusal. Other profiles/errors receive no unsupported capability promise.

Direct Extrude wall-collapse failures are connected to the Draft field in creation and History. History shows one inline diagnostic with Draft/Distance/Reset recovery and preserves kernel evidence. A rejected unchanged draft cannot be submitted again through either Apply or Enter; edits retire that failure and Reset restores accepted values. Later-feature failures are not relabelled.

Validation:
- Final TypeScript/Vite production build PASS (`/tmp/cad-half-draft-recovery-build-final.log`), focused changed-file ESLint PASS.
- New helper plus nearby Fillet/Draft-Hole feedback tests: 7/7 PASS.
- Actual `half-disk-draft-extrude-browser.mjs` at 1024×800 and 1440×900 PASS (`/tmp/cad-half-draft-recovery-r2-{1024,1440}-20261116`). Create -10° limitation and 35° collapse with linked invalid field; 10° accepted; History35° inline failure with disabled Apply/Enter protection and unchanged document; Reset10°; recover14°, strict native B-rep, independent cross-section/volume checks, Undo/Redo and real Save/Open. Narrow History screenshot reviewed.
- Initial build caught insufficient numeric narrowing for parameter-capable sketch coordinates. Added explicit numeric guards; final build/tests/browser pass. Keyboard Apply guard was checked alongside the disabled button.

Scope: XY R10 semicircle and diameter at distance10; no new kernel range, arbitrary-plane/parameter-bound outward support or assistive-technology claim. #126 protected WIP unchanged.
