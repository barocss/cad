# #29 explicit Untrim → Extend → file roundtrip

Verification only on main `79c12e5a394b19398aeae05cb314585bbd5e8242`. No product change. Existing D341 trim-region and D347 initially-untrimmed Extend receipts did not prove this exact chain; the later trim-preflight run explicitly left geometry and Save/fresh Open NOT_RUN.

The existing D341 synthetic outside-hole surface was opened normally. Trimmed Extend remained disabled with scope guidance (DOM assertion). Explicit Untrim removed only selected trim metadata; it intentionally removes openings and is not automatic trim preservation. A separate u-max Extend by 2.5 mm succeeded. Original source strings and other objects/nodes/outputs stayed intact; selected original became hidden.

The compiler was used only to decode the exact object geometry ID. Independently checked original affine support, then all unit-weight control coefficients against normalized Greville affine coefficients: x12…47.5, y−4…20, z3. Nonnegative partition-of-unity bounds the entire surface position by the maximum coefficient L1 residual: 6.666704965851977e-10 mm, below the 1e-7 mm threshold. This is the bounded affine fixture, not arbitrary curved refit certification.

Actual Save download and fresh-context Open retained the complete document and decoded geometry, and the result was selected again. Run exit0 PASS, no runtime/console/source-change errors, contexts/browser/server closed. No product fix required. #29 remains OPEN.

Both images are synthetic actual screenshots. `trimmed-original.png` shows the original geometry before explicit Untrim; the preflight notice is cropped and its visible rendering is NOT claimed. `reopened-result.png` shows selected output after actual file reopen. Undo/Redo was not repeated; general surfaces, solid/mass and renderer precision are NOT_RUN.
