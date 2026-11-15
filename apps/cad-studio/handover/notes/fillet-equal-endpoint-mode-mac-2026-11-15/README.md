# D1412 — Equal positive Fillet endpoints

## Scope and compatibility

Completes #120. Explicit positive End radius keeps both authored endpoints even when equal or within the former1e-9 mode-conversion threshold. Creation1→1 and creation1→3 followed by History End1 retain the same Varying mode and later one-end editing. End0 remains the legacy scalar sentinel. Negative/NaN fallback remains unchanged under #76; this is not its validation fix.

Kernel code is unchanged, but selecting stored `radii` selects the existing general rolling-ball path instead of the scalar native path. B-rep representation and face counts can therefore differ. Explicit equal-positive closed/disconnected/branched selections now encounter the existing open-chain refusal instead of silently becoming Constant; no closed-chain capability is added. Existing documents are not migrated.

## Verification

- New Model5/5 and retained equal-end-controls/interior-station/station-binding:18/18 PASS. Exact and ±5e-10 endpoint preservation, full payload/native equality between the two varying paths, later End edits, endpoint parameter-reference retention, native Save/Open, closed/disconnected/branched refusal and invalid-start native rejection covered.
- Target lint, Model/Studio TypeScript, production build, driver JavaScript/Python syntax and diff check PASS.
- Actual Chrome1024×800 and1440×900: public HUD1→1 and1→3 creation, History End1 then End3, two enabled endpoint fields, whole-document references/payload preservation, Undo/Redo and native Save/fresh Open PASS. Explicit Constant HUD/End0 scalar control remains one Radius field and preserves scalar geometry.
- Thirty independent native oracles PASS; eight axial positions × three circular contact/diagonal samples. Expected equal volume `7200−30(1−π/4)=7193.561944901923` mm³, native7193.561944901909. Linear1→3 radius-square integral130 gives7172.101761241668 mm³, native7172.101761241656. Volume tolerance1e-7 mm³, section tolerance1e-6 mm; maximum section residual9.023962679190913e-13 mm.
- Equal varying native digest `9a1c6b4355041b422c753193b7c0c4d1891d9783cbdb0dbb5e19b288f2aec2e3`; linear digest `01d4a86547047d70f61df400ff12e14e2c224aeea882289c304da072d88cf916`. Scalar has7 faces versus varying11 and is not required to share its digest.
- Separate read-only native review checked scalar/equal horizontal and vertical box edges, the known open R8 arc and a Draft8° edge: all strict valid. Representations differed, largest observed volume difference7.65e-7 mm³ on the arc. This is a bounded smoke comparison, not general family equivalence.
- Receipt `d1412-first/receipt.json` SHA256 `89ba8f91ecd8882f281d75c6a29c8333b323f1707a78fd1bfe4cd2eb11aa30af`: PASS, errors0, console errors0, source changes0 across961 frozen sources;16 contexts/browser/server closed.
- Direct visual review:1024 direct-equal History and1440 fresh History-equal show Varying/Circular with both Start1 and End1 inputs. Numeric success does not qualify general rendering.

## Reproduce and limits

From Studio run `D1412_SOURCE_FROZEN=1 node test/fillet-equal-positive-mode-browser.mjs <external-output>` with the existing Chrome/Playwright environment and frozen sources. Driver qualification is one original straight convex edge of a30×12×20 box, not closed chains or arbitrary blends. Python oracle imports no product code. Finite support-surface samples and total volume do not prove all trim boundaries or general continuity. Existing Drawing failures, API drift and HOLDs remain. CI was not awaited per instruction.
