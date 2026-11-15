import { Icon } from '../ui/atoms';
import type { ModelExportController } from './useModelExports';

/** Export options presented by the model export controller. */
export function ModelExportDialogs({ controller }: { controller: ModelExportController }) {
  const { stlAsk, stlQuality, stlBusy, stlLossHint, stlTargets, stlCancelButton, changeStlQuality, cancelStlExport, exportStl } = controller;
  return <>
      {stlAsk && <div className="toast card recovery" role="dialog" aria-label="STL export" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); cancelStlExport(); } }}>
        <Icon name="download" className="accent" />
        <div><div className="toast-title">STL export</div>
          <label className="kv"><span>Quality</span><select autoFocus aria-label="STL export quality" value={stlQuality} disabled={stlBusy} onChange={e => changeStlQuality(e.target.value)}>
            <option value="automatic">Automatic</option><option value="8">Draft 8</option><option value="16">Standard 16</option><option value="32">Fine 32</option>
          </select></label>
          <div className="toast-hint">{stlLossHint} Automatic allows the on-screen mesh as a fallback. Draft, Standard and Fine require BRep bodies.</div>
          <div className="toast-hint" aria-label="STL target boundaries">Root bodies (including hidden bodies; not selection-only):
            <ul className="max-h-32 overflow-y-auto">{stlTargets.map(body => <li key={body.key}>{body.name} ({body.key}): {body.type} · {body.boundaries}</li>)}</ul>
            Native boundary counts are not STL mesh edge counts. {stlTargets.some(body => body.open) && 'Open surfaces may produce open STL mesh boundaries. Check the downloaded mesh before use.'}
          </div>
          <div className="row-actions"><button className="primary" disabled={stlBusy} onClick={() => void exportStl()}>{stlBusy ? 'Preparing…' : 'Export'}</button><button ref={stlCancelButton} className="ghost" onClick={cancelStlExport}>Cancel</button></div>
        </div>
      </div>}
  </>;
}
