import { traceImage, type ImageTrace } from '../../src/chat/trace';

const colors = {
  background: [255, 255, 255], head: [16, 66, 130], handle: [105, 59, 25], button: [188, 27, 46], filter: [33, 155, 112],
};

const inBox = (x: number, y: number, a: number, b: number, c: number, d: number) => x >= a && x < c && y >= b && y < d;

export function twoViewPixels(view: 'front' | 'side', sideHandleTop = 94) {
  const width = 200, height = 185, rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const radius = Math.hypot(x + .5 - 95, y + .5 - 58);
    const head = view === 'front' ? radius < 42 && radius >= 28 : inBox(x, y, 59, 16, 113, 100);
    const handle = view === 'front' ? inBox(x, y, 84, 94, 106, 157) : inBox(x, y, 74, sideHandleTop, 94, 157);
    const button = inBox(x, y, 91, 111, 99, 123);
    const filter = view === 'front' ? inBox(x, y, 82, 157, 108, 170) : inBox(x, y, 72, 157, 96, 170);
    const key = button ? 'button' : filter ? 'filter' : handle ? 'handle' : head ? 'head' : 'background';
    rgba.set([...colors[key], 255], (y * width + x) * 4);
  }
  return { rgba, width, height };
}

export function twoViewTrace(view: 'front' | 'side', sideHandleTop?: number) {
  const { rgba, width, height } = twoViewPixels(view, sideHandleTop);
  return traceImage(rgba, width, height);
}

export function twoViewAssignments(front: ImageTrace, side: ImageTrace) {
  const find = (view: ImageTrace, key: keyof typeof colors) => {
    const color = '#' + colors[key].map(c => c.toString(16).padStart(2, '0')).join('');
    const layer = view.layers.find(entry => entry.color === color);
    if (!layer) throw new Error(`The trace did not retain ${key}.`);
    return layer.id;
  };
  const pair = (name: string, key: keyof typeof colors) => ({ name, frontLayer: find(front, key), sideLayer: find(side, key) });
  return { reference: { ...pair('Ring head', 'head'), diameterMM: 84 },
    parts: [pair('Handle', 'handle'), pair('Filter cap', 'filter'), pair('Button', 'button')] };
}
