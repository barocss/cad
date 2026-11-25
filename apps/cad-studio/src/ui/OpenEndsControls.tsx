import { Button } from '@/components/ui/button';
import type { SketchOpenEndsController } from '../sketch/useSketchOpenEnds';

const fmt = (value: number) => String(Math.round(value * 100) / 100);

export interface OpenEndsControlsProps {
  openEnds: SketchOpenEndsController;
}

export function OpenEndsControls({ openEnds }: OpenEndsControlsProps) {
  if (!openEnds.enabled) return null;
  const { active, report } = openEnds;
  const { chains, ends } = report;
  return (
    <section
      aria-label="Open ends"
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={active}
          onClick={openEnds.toggle}
        >
          {active ? 'Hide open ends' : 'Find open ends'}
        </Button>
      </div>
      {active ? (
        ends.length > 0 ? (
          <>
            <p role="status" className="muted small">
              Found {ends.length} open ends ({chains.length} open {chains.length === 1 ? 'chain' : 'chains'}).
            </p>
            <ul className="grid max-h-28 gap-0.5 overflow-y-auto text-xs text-muted-foreground" aria-label="Open end positions">
              {ends.map(end => (
                <li key={`${end.chainIndex}:${end.role}`}>
                  <strong>{end.label}</strong> · ({fmt(end.point[0])}, {fmt(end.point[1])}) mm
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p role="status" className="muted small">
            No open ends found in material contours.
          </p>
        )
      ) : null}
    </section>
  );
}
