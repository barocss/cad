# Thread history and first-line refusal guidance (#42)

Saved face-thread features now expose Pitch, Length (0: whole face), Hand, and From. Saved nominal-diameter threads expose Nominal Ø; ordinary external threads expose Relief groove. Automatic length/right-hand/+end restore omission semantics; parent/face references remain unchanged. Numeric guards distinguish positive pitch/diameter from nonnegative length/relief. Zero-length guidance explicitly means the whole face, not the fillet's same-radius convention.

The shared friendly-error mapping promotes recognized native FACE_THREAD_SIZE length, nominal-size, and pitch failures, plus FACE_THREAD_RELIEF, into visible first-line title/hint while preserving kernel detail. It does not widen supported geometry or turn arbitrary errors into size errors.

## Verification

- Model face-thread suite: 5/5 PASS. Native shaft/bore history edits evaluate, preceding geometry is unchanged, zero removes explicit length; actual native length31/face30 and nominal5/bore5 failures retain FACE_THREAD_SIZE details with distinct friendly titles.
- Studio numeric regression: 6/6 PASS, including neighboring numeric rules and thread-specific zero guidance.
- Chrome WebGPU browser: shaft Ø6×30 and Ø5 bore in 30×30×10 box, at 1024×900 and 1440×900, all PASS. Length31 / Nominal Ø5 rejected without document mutation; visible guidance and Reset recovery verified. Pitch0.75, length4, left hand, negative end apply; Undo/Redo, native Save/fresh Open preserve fields. Return to right hand and whole-face length removes optional fields. Screenshots inspected.
- Focused lint, diff whitespace, and final production TypeScript/Vite build: PASS.
- Initial fixture construction used a 5mm-long M6×1 bore thread that the existing kernel rejected with planar-face triangulation failure before any history edit. Final regression uses the supported whole-face M6×1 bore fixture from the existing API suite and edits it to the tested 0.75-pitch/4mm case. This is not a general partial-bore capability claim.

Full round Along was delivered separately in 3e69303ea5113148ba74a51f44b35a01b5349b64 with both-axis volume and browser regression. Together these changes cover #42's history editing and visible refusal completion criteria. WebGL2, whole-application aggregate suite, arbitrary thread sizes/faces, and a new strict B-rep audit were not run. #126 protected WIP excluded.
