import { useState } from 'react';
import { convexHull } from '@barocss/cad';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { JointTree } from '@barocss/cad-model/robot/joints';
import { sweepLinks } from '@barocss/cad-model/robot/sweep';
import { workspaceMap, type WorkspaceMap } from '@barocss/cad-model/robot/workspace';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { downloadBytes } from '../ui/files';
import { TICK } from '../ui/panelStyles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ReadBodies = (part: string) => readonly BodyResult[] | undefined;
/** Existing deepest-link/farthest-hull tool selection; no geometry or admission change. */
function workspaceEndLink(tree: JointTree): string {
  const depth = (l: string): number => { const j = tree.joints.find(x => x.child === l); return j ? 1 + depth(j.parent) : 0; };
  return tree.links.reduce((b, l) => depth(l.id) > depth(b.id) ? l : b, tree.links[0]).id;
}
export function mapRobotWorkspace(tree: JointTree, readBodies: ReadBodies, n: number, h: number, free: boolean, end = workspaceEndLink(tree)): WorkspaceMap {
  // (The tool point: the end link's farthest hull point from its joint at the solved pose — its tip.)
  const links = sweepLinks(tree, readBodies, pts => convexHull(pts).positions), own = tree.joints.find(j => j.child === end)?.origin ?? [0, 0, 0];
  const hull = links.find(l => l.link === end)?.hull; let tool: number[] | undefined, far = -1;
  if (hull) for (let i = 0; i < hull.length; i += 3) { const d = Math.hypot(hull[i] - own[0], hull[i + 1] - own[1], hull[i + 2] - own[2]); if (d > far) { far = d; tool = [hull[i], hull[i + 1], hull[i + 2]]; } }
  return workspaceMap(tree, { link: end, samples: n, h, ...(tool ? { tool } : {}), ...(free ? { links } : {}) });
}
interface Props {
  tree: JointTree;
  readBodies: ReadBodies;
  ready: boolean;
  workspace: WorkspaceMap | null;
  onChange(workspace: WorkspaceMap | null): void;
  fileName: string;
  onNotice(notice: FriendlyError): void;
}
/** Workspace controls and evidence, composed into the live joints card without subscribing to the pose. */
export function RobotWorkspacePanel({ tree, readBodies, ready, workspace, onChange, fileName, onNotice }: Props) {
  const [wsN, setWsN] = useState(20000), [wsH, setWsH] = useState(10), [wsFree, setWsFree] = useState(false);
  const map = () => {
    const end = workspaceEndLink(tree); // Keep tree selection outside the existing mapping refusal boundary.
    try { onChange(mapRobotWorkspace(tree, readBodies, wsN, wsH, wsFree, end)); }
    catch (e) { onNotice({ title: 'Workspace not mapped', hint: e instanceof Error ? e.message.replace(/^\[[A-Z_]+\] /, '') : String(e), detail: '' }); }
  };
  const summary = workspace ? `Workspace of ${workspace.samples} poses${workspace.excluded ? ` (${workspace.excluded} in self-contact left out)` : ''}: ${workspace.voxels.length} voxels of ${workspace.h} mm, reach ${workspace.reach.toFixed(1)} mm, best manipulability ${Math.max(0, ...workspace.voxels.map(v => v.w)).toExponential(3)}` : null;
  const download = () => workspace && downloadBytes(new TextEncoder().encode(JSON.stringify(workspace)), `${fileName}-workspace.json`, 'application/json');
  return <>
      {tree.joints.some(j => j.type !== 'fixed') && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 text-[11px] [&>label]:inline-flex [&>label]:items-center [&>label]:gap-1 [&>label]:whitespace-nowrap" aria-label="Workspace">
        <label>N <Input type="number" aria-label="Workspace samples" min={100} max={200000} step={1000} value={wsN} onChange={e => setWsN(Number(e.target.value))} style={{ width: 70 }} /></label>
        <label> h <Input type="number" aria-label="Workspace voxel" min={0.5} step={1} value={wsH} onChange={e => setWsH(Number(e.target.value))} style={{ width: 48 }} /> mm</label>
        <label title="Leave out poses where two links interpenetrate (RM6's exact test): slower"> <input type="checkbox" className={TICK} aria-label="Workspace contact-free" checked={wsFree} onChange={e => setWsFree(e.target.checked)} /> contact-free</label>
        <Button variant="ghost" aria-label="Map workspace" disabled={!ready || !(wsN >= 1 && wsH > 0)} title="The positions the end link's joint point reaches over the joints' ranges, coloured by manipulability" onClick={() => map()}>Workspace</Button></div>}
      {workspace && <div className="kv muted" role="status" aria-label="Workspace summary">{summary} <Button variant="ghost" aria-label="Download workspace" onClick={download}>JSON</Button><Button variant="ghost" aria-label="Hide workspace" onClick={() => onChange(null)}>Hide</Button></div>}
  </>;
}
