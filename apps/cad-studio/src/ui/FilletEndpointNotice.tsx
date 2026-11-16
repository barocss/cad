import type { FilletEndpoints } from '../app/filletEndpoints';
export function FilletEndpointNotice({locations}:{locations:FilletEndpoints}) {
 return <div className="small muted" role="group" aria-label="Fillet endpoint locations">{'reason' in locations ? locations.reason : <><div>Original edge locations (read-only)</div><div>Start: ({locations.start.join(', ')})</div><div>End: ({locations.end.join(', ')})</div>{locations.stationProblem && <div>{locations.stationProblem}</div>}{locations.stations?.map(station=><div key={station.label}>{station.label}: ({station.at.join(', ')})</div>)}</>}</div>;
}
