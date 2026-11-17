# Inherited ring, drive and connector catalogue protection (#671)

Baseline main: 8239a8350dac0cf6511bd39adc3babaf4e3d3ef4.

Three independently built placed parts inherited their parent catalogue. Core evaluation passed before removal; root deletion succeeded, then effective-child evaluation failed with RING_ROW_UNKNOWN, DRIVE_ROW_UNKNOWN and CONNECTOR_ROW_UNKNOWN respectively. Local same-ID override controls stayed evaluable after parent removal. Real Chrome Library Remove deleted each used row independently.

The internal inheritedRowUsed helper follows current placed children but stops at a same-ID local owner. Existing API signatures, error text, atomic rejection, valid replacement and unused deletion are unchanged. Hidden/suppressed authored uses remain protected. Only rings/drives/connectors use this helper in this change; bearing/O-ring guards are untouched.

Validation:
- 31/31 focused tests: direct/nested inheritance, nearest override, unrelated rows, shared/hidden/suppressed children, unchanged input, normal deletion/replacement, existing ring/drive/connector and bearing/O-ring inheritance regression.
- Model TypeScript, changed-file ESLint and read-only review passed.
- Chrome separately verified each Library refusal with unchanged document, unused deletion, Undo/Redo, Save/fresh Open and rendered part.
- 1125-file frozen capsule unchanged, no page/console errors, all browser/server resources closed.

Limits: the new drive browser fixture is a coupling, not every drive command. Existing drive tests cover other commands; no expanded full qualification is claimed. Pending revisions, mount/fastener categories, new schemas, manufacturing certification and existing HOLD remain outside scope. doc-sync is not resumed.

Images are named <kind>-baseline, -protected and -reopened. Baseline document deltas, not an early empty canvas alone, prove the defect.
