import type { Dispatch, SetStateAction } from 'react';
import type { Selection } from '@barocss/cad-model/app/commands';
import { sweepPath } from '@barocss/cad-model/app/profileCommands';
import type { DirectGeometry } from '@barocss/cad-model/engine/direct';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { emptySel } from '../app/studioConstants';
import { Icon } from './atoms';

interface SketchBrowserRowsProps {
  indices: readonly number[];
  selected?: readonly number[];
  onPick(index: number, additive: boolean): void;
}

export function SketchBrowserRows({ indices, selected, onPick }: SketchBrowserRowsProps) {
  if (!indices.length) return null;
  return <>
    <div className="ol-head">Sketches</div>
    {indices.map(index => {
      const active = selected?.includes(index) ? ' sel' : '';
      return <div key={'s' + index} className={'ol-row' + active}>
        <span className="ol-eye"><Icon name="cad-sketch" small /></span>
        <button className={'ol' + active} onClick={event => onPick(index, event.shiftKey)}>Sketch {index + 1}</button>
      </div>;
    })}
  </>;
}

interface DirectBrowserRowsProps {
  doc: StudioDoc;
  selected: readonly string[];
  actions: {
    retarget(input: { path: string }): boolean;
    commit(next: DirectGeometry, selected: string[]): boolean;
    selectGeometry: Dispatch<SetStateAction<string[]>>;
    selectModel: Dispatch<SetStateAction<Selection>>;
  };
}

export function DirectBrowserRows({ doc, selected, actions }: DirectBrowserRowsProps) {
  const { direct } = doc;
  if (!direct?.objects.length) return null;
  return <>
    <div className="ol-head">Curves and surfaces</div>
    {direct.objects.map(object => (
      <button key={object.id} className={'ol direct' + (selected.includes(object.id) ? ' sel' : '') + (object.hidden ? ' hidden-obj' : '')}
        title={object.hidden ? 'Hidden: click to show' : object.name}
        onClick={event => {
          const { id } = object;
          if (actions.retarget({ path: id })) return;
          if (object.hidden) {
            actions.commit({ ...direct, objects: direct.objects.map(item => item.id === id ? { ...item, hidden: false } : item) }, [id]);
            return;
          }
          const additive = event.shiftKey;
          const keepProfile = !additive && typeof sweepPath(doc, [id]) !== 'string';
          actions.selectModel(previous => keepProfile && previous.sketches?.length === 1 && !previous.profileRegions?.indices.length
            ? { ...emptySel, sketches: previous.sketches } : emptySel);
          actions.selectGeometry(previous => additive ? (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]) : [id]);
        }}><Icon name={object.hidden ? 'visibility_off' : 'gesture'} small />{object.name}</button>
    ))}
  </>;
}
