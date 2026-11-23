import { stepContinuityNotice } from '../ui/continuityRecovery';
import type { StepFaceAssociation } from '@barocss/cad-model/engine/editableStepEvidence';
import type { ModelExportController } from './useModelExports';

const bodyCount = (count: number, label: string) => `${count} ${label} ${count === 1 ? 'body' : 'bodies'}`;
const roleLabels: Record<StepFaceAssociation['role'], string> = {
  'x-min': '−X side', 'x-max': '+X side', 'y-min': '−Y side', 'y-max': '+Y side',
  bottom: 'Bottom cap', top: 'Top cap', bore: 'Through bore',
  'first-end': 'First end', 'first-seat': 'First seat', shoulder: 'Shoulder',
  'second-seat': 'Second seat', 'second-end': 'Second end',
};
const featureLabels: Record<StepFaceAssociation['feature']['kind'], string> = { extrude: 'Extrude', hole: 'Hole', shaft: 'Shaft' };

function EditableStepCopyPanel({ controller, preview }: { controller: ModelExportController; preview: NonNullable<ModelExportController['editablePreview']> }) {
  const { clearStepAsk, saveEditableCopy } = controller;
  return <section className="card" aria-label="Editable STEP copy" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); clearStepAsk(); } }}>
    <div className="card-title">EDITABLE STEP COPY</div>
    <div className="kv"><span>File</span><b>{preview.name}</b></div>
    {preview.stage === 'checking' && <p role="status">Checking STEP geometry…</p>}
    {preview.stage === 'error' && <p role="alert">{preview.error}</p>}
    <form onSubmit={event => {
      event.preventDefault();
      saveEditableCopy(new FormData(event.currentTarget).has('named'));
    }}>
      {preview.stage === 'ready' && <>
        <div className="kv"><span>New features</span><b>{preview.features}</b></div>
        <p className="muted">Geometry only. Original history is unknown.</p>
        <details>
          <summary>{preview.evidence.regions.reduce((count, region) => count + region.sourceFaces.length, 0)} source faces explained</summary>
          {preview.evidence.regions.map(region => <div className="kv" key={region.role}>
            <span>{roleLabels[region.role]}</span>
            <b>{featureLabels[region.feature.kind]}{region.trimmedBy ? ' · Hole trim' : ''}</b>
          </div>)}
        </details>
        {preview.parameterNames.length > 0 && <label className="kv">
          <span>Named thickness and hole centre</span> <input type="checkbox" name="named" />
        </label>}
      </>}
      <div className="row-actions">
        <button type="submit" className="primary" disabled={preview.stage !== 'ready'}>Save copy</button>
        <button type="button" className="ghost" onClick={clearStepAsk}>Cancel</button>
      </div>
    </form>
  </section>;
}

/** One preparation panel in the existing right dock; only Export downloads. */
export function StepExportPanel({ controller }: { controller: ModelExportController }) {
  const { editablePreview, stepPreview: step, clearStepAsk, exportStepFile, downloadStep } = controller;
  if (editablePreview) return <EditableStepCopyPanel controller={controller} preview={editablePreview} />;
  if (!step) return null;
  const scope = step.scope;
  const excluded = scope?.excludedHiddenRootBodies ?? 0;
  const summary = scope && (step.rootScope === 'visible'
    ? `${bodyCount(scope.rootBodies + scope.placedBodies, 'output')} · ${bodyCount(scope.rootBodies, 'visible root')} · ${excluded} hidden ${excluded === 1 ? 'root' : 'roots'} excluded · ${bodyCount(scope.placedBodies, 'placed')}`
    : `${scope.rootBodies + scope.placedBodies} output bodies: ${scope.rootBodies} root bodies, including ${scope.hiddenRootBodies} hidden; ${scope.placedBodies} placed bodies from ${scope.occurrences} visible occurrences.`);
  return <section className="card" aria-label="STEP export" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); clearStepAsk(); } }}>
    <div className="card-title">STEP EXPORT <button className="ghost small" aria-label="Close STEP export" onClick={clearStepAsk}>Close</button></div>
    <div className="kv"><span>File</span><b>{step.name}.step</b></div>
    {step.stage === 'ready' && <p className="muted">{step.profile}</p>}
    <label className="kv"><span>Root bodies</span><select aria-label="STEP root body scope" value={step.rootScope} onChange={e => void exportStepFile(step.meshes, e.target.value as typeof step.rootScope)}>
      <option value="all">All root bodies</option><option value="visible">Visible root bodies</option>
    </select></label>
    {step.hasMeshes && <label className="kv"><span>Mesh bodies</span><select aria-label="STEP mesh representation" value={step.meshes} onChange={e => void exportStepFile(e.target.value as typeof step.meshes, step.rootScope)}>
      <option value="auto">Auto</option><option value="tessellated">Tessellated</option><option value="planar">Planar faces</option>
    </select></label>}
    {step.hasMeshes && <p className="muted">Auto uses planar faces for small closed meshes and tessellation for larger or open meshes. Reader support varies.</p>}
    {step.stage === 'preparing' && <p role="status">Preparing geometry and loss report…</p>}
    {step.stage === 'error' && <p role="alert">{step.error}</p>}
    {step.stage === 'ready' && <>
      {summary && <p className="muted" aria-label="STEP included bodies">{summary}</p>}
      <div className="ol-head">What this file leaves out</div>
      {step.losses.length ? <ul aria-label="STEP loss report">{step.losses.map(loss => <li key={loss}>{loss}</li>)}</ul> : <p>No additional losses reported for this input.</p>}
      <p className="muted">Geometry profile: no semantic PMI or named datum system transfer. The file/product name and generated face names are separate from user labels.</p>
      <p className="muted" aria-label="STEP continuity inspection">{stepContinuityNotice}</p>
    </>}
    <div className="row-actions"><button className="primary" disabled={step.stage !== 'ready'} onClick={downloadStep}>Export</button><button className="ghost" onClick={clearStepAsk}>Cancel</button></div>
  </section>;
}
