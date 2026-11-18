#!/bin/bash
set -euo pipefail
# Caller owns the heavy slot; this runner never kills or reuses another worker's processes.
: "${WORKSPACE_SAMPLES_BASELINE_FROZEN:?freeze writers and set to 1}"
: "${WORKSPACE_BASELINE_HEAD:?set exact reviewed HEAD}"
: "${PW_DIR:?}" "${CHROME:?}"
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
OUT=${1:?absolute artifact directory outside repository}
[[ "$OUT" = /* && "$OUT" != "$ROOT" && "$OUT" != "$ROOT/"* ]] || exit 2
[[ "$(git -C "$ROOT" rev-parse HEAD)" = "$WORKSPACE_BASELINE_HEAD" ]] || exit 3
mkdir -p "$OUT"
node -e 'const f=require("fs");const s=f.statfsSync(process.argv[1]);if(s.bavail*s.bsize<2*1024**3)throw Error("2 GiB disk reserve");' "$OUT"
# flow-helper closes only this invocation's context/browser/server in finally and writes cleanup receipt.
cd "$ROOT/apps/cad-studio"
node test/robot-workspace-samples-baseline-browser.mjs "$OUT" >"$OUT/driver.log" 2>&1
