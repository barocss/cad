import { Button } from '@/components/ui/button';
import { useEffect, useRef } from 'react';
import type { Active } from '../app/commandState';

type Edge = Active['ctx']['selection']['edges'][number];

export function FilletPickedEdges({ active, onRemove, onLocate }: {
  active: Active; onRemove(owner: Active, edge: Edge): void; onLocate?(owner: Active, edge: Edge | null): void;
}) {
  const hovered = useRef<Edge | null>(null), focused = useRef<Edge | null>(null);
  const publish = () => onLocate?.(active, hovered.current ?? focused.current);
  const clear = () => { hovered.current = null; focused.current = null; onLocate?.(active, null); };
  useEffect(() => { hovered.current = null; focused.current = null; }, [active.cmd, active.ctx]);
  return <details onToggle={event => { if (!event.currentTarget.open) clear(); }}
    onPointerLeave={() => { hovered.current = null; publish(); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { focused.current = null; publish(); } }}>
    <summary className="cursor-pointer" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}>Edit picked edges</summary>
    <ul className="m-0 mt-1 grid list-none gap-1 p-0">
      {active.ctx.selection.edges.map(edge => {
        const names = active.ctx.bodies[edge.body]?.mesh.edges[edge.edge]?.names.join(', ');
        if (!names) return null;
        return <li key={`${edge.body}:${edge.edge}`} className="flex items-center justify-between gap-1 rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary"
          tabIndex={0} aria-label={`Locate ${names}`}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
          onPointerEnter={() => { hovered.current = edge; publish(); }}
          onPointerLeave={() => { hovered.current = null; publish(); }}
          onFocus={() => { focused.current = edge; onLocate?.(active, edge); }}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { focused.current = null; publish(); } }}>
          <span className="min-w-0 truncate" title={names}>{names}</span>
          <Button type="button" variant="ghost" size="xs" aria-label={`Remove ${names}`}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
            onClick={() => onRemove(active, edge)}>Remove</Button>
        </li>;
      })}
    </ul>
  </details>;
}
