import * as React from 'react';
import { ExampleShell, InspectorGroup, NumericField, exampleErrorMessage } from '../examples/ExampleShell';
import { connectHost } from '../examples/connect-host';
import type { EnginePort, MassPolicy, ModelHost } from '../src/engine';
import { Extrude, Hole, Part, Rectangle } from '../src/index';
import { ExistingViewerHost } from '../src/viewer';

export function HolePropsFixture({ engine, massPolicy, onHost }: {
  engine: EnginePort;
  massPolicy: MassPolicy;
  onHost: (host: ModelHost | null) => void;
}) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const [host, setHost] = React.useState<ModelHost | null>(null);
  const [radius, setRadius] = React.useState(4);
  const [depth, setDepth] = React.useState(6);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let retired = false;
    let owned: ModelHost | null = null;
    void ExistingViewerHost.create(canvas.current!).then(sink => {
      if (retired) { sink.dispose(); return; }
      owned = connectHost(engine, massPolicy, sink);
      setHost(owned);
      onHost(owned);
    }).catch(cause => {
      if (!retired) setError(exampleErrorMessage(cause));
    });
    return () => { retired = true; owned?.dispose(); onHost(null); };
  }, [engine, massPolicy, onHost]);

  return <ExampleShell documentName="Blind hole" canvas={canvas} host={host} error={error}
    onReset={() => { setDepth(6); setRadius(4); }} controls={<InspectorGroup title="Hole">
      <NumericField label="Radius" ariaLabel="Hole Radius" value={radius} min={1} max={19} step={1} unit="mm" onChange={setRadius}/>
      <NumericField label="Depth" ariaLabel="Hole Depth" value={depth} min={1} max={19} step={1} unit="mm" onChange={setDepth}/>
    </InspectorGroup>}>
    {host && <Part admission="synchronous" lifecycle={host}>
      <Hole center={[30, 20]} radius={radius} depth={depth}>
        <Extrude distance={20}><Rectangle min={[0, 0]} max={[60, 40]}/></Extrude>
      </Hole>
    </Part>}
  </ExampleShell>;
}
