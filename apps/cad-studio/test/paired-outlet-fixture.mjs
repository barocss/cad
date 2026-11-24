const solid = node => ({ node, side: 'solid' });

export const tiltedDonor = { origin: [39.25, 55, 12], normal: [4 / Math.sqrt(17), -1 / Math.sqrt(17), 0], xAxis: [0, 0, 1] };
export const tiltedInletDonor = { origin: [-12.75, -15, 12], normal: [-4 / Math.sqrt(17), 1 / Math.sqrt(17), 0], xAxis: [0, 0, 1] };
export function pairedOutletFixture({ replace = false, inlet = false, donorMin, donorMax } = {}) {
  return {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 5,
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -5], max: [2, 5],
        holes: [-2, 2].map(y => [[-1, y - 1], [-1, y + 1], [1, y + 1], [1, y - 1]].map(start => ({ kind: 'line', start }))),
        sideTags: { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8'], ['e9', 'e10', 'e11', 'e12']] } },
      { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Paired duct', mode: 'exact',
        path: { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5],
          controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 16, 0],
            [12, 20, 0], [12, 38, 0], [30, 38, 0], [33, 38, 0], [36, 38, 0]],
          weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1, 1, 1] } },
      replace ? { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [-3, -3], max: [3, 3], plane: inlet ? tiltedInletDonor : tiltedDonor }
        : { id: 'n2', kind: 'sketch', profile: 'rectangle', min: donorMin, max: donorMax },
      { id: 'n3', kind: 'extrude', sketch: 2, height: replace ? .5 : 4, ...(replace ? {} : { from: 10 }) },
      { id: 'n4', kind: 'translate', parent: solid(3), offset: [0, 0, 0] },
    ],
    outputs: { b1: solid(1), b4: solid(4) },
  };
}
