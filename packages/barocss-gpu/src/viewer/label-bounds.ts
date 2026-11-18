/** Conservative, padding-inclusive glyph quads; not ink or depth-visibility measurements. */
export interface LabelGlyphBounds {
  readonly labelIndex: number;
  readonly rects: readonly { left: number; top: number; right: number; bottom: number }[];
}
export interface LabelBoundsSnapshot { readonly epoch: object; readonly bounds: readonly LabelGlyphBounds[] }
export interface UploadedGlyphLayout {
  readonly data: Float32Array;
  readonly glyphs: readonly { labelIndex: number; instance: number }[];
}
const point = (m: ArrayLike<number>, x: number, y: number, z: number, w = 1): number[] => [
  m[0]*x+m[4]*y+m[8]*z+m[12]*w, m[1]*x+m[5]*y+m[9]*z+m[13]*w,
  m[2]*x+m[6]*y+m[10]*z+m[14]*w, m[3]*x+m[7]*y+m[11]*z+m[15]*w,
];
/** Projects retained F32 upload records with the submitted frame's F32 matrices. No layout/raster work. */
export function projectedGlyphBounds(layout: UploadedGlyphLayout, model: ArrayLike<number>, vp: ArrayLike<number>, width: number, height: number, ratio: number, cssWidth: number, cssHeight: number): LabelGlyphBounds[] | null {
  if (![width,height,ratio,cssWidth,cssHeight].every(v=>Number.isFinite(v)&&v>0)
    || model.length!==16 || vp.length!==16 || !Array.from(model).every(Number.isFinite) || !Array.from(vp).every(Number.isFinite)) return null;
  const result = new Map<number, {left:number;top:number;right:number;bottom:number}[]>();
  for (const glyph of layout.glyphs) {
    const o=glyph.instance*20, d=layout.data;
    if (!Number.isSafeInteger(glyph.labelIndex)||glyph.labelIndex<0||!Number.isSafeInteger(glyph.instance)||glyph.instance<0||o+20>d.length) return null;
    // Colour is packed RGBA8, not a floating point value.
    if (!Array.from(d.subarray(o,o+20)).every((v,i)=>i===3||Number.isFinite(v))) return null;
    if ((new Uint32Array(d.buffer,d.byteOffset,d.length)[o+3]>>>24)===0) continue;
    const plane=d[o+15]>=1.5, projected:number[][]=[];
    for (const [x,y] of [[d[o+4],d[o+5]],[d[o+6],d[o+5]],[d[o+6],d[o+7]],[d[o+4],d[o+7]]]) {
      const w=plane?point(model,d[o]+d[o+12]*x+d[o+16]*y,d[o+1]+d[o+13]*x+d[o+17]*y,d[o+2]+d[o+14]*x+d[o+18]*y):point(model,d[o],d[o+1],d[o+2]);
      // Shader takes model.xyz and subsequently supplies w=1.
      const q=point(vp,w[0],w[1],w[2]);
      if (!q.every(Number.isFinite)||q[3]<1e-6||q[2]<0||q[2]>q[3]) { projected.length=0; break; }
      projected.push([(q[0]/q[3]+1)*cssWidth/2+(plane?0:x*ratio*cssWidth/width),(1-q[1]/q[3])*cssHeight/2+(plane?0:y*ratio*cssHeight/height)]);
    }
    // Near/far/eye-crossing quads are deliberately unavailable rather than extrapolated.
    if (projected.length!==4) continue;
    const left=Math.max(0,Math.min(...projected.map(p=>p[0]))),right=Math.min(cssWidth,Math.max(...projected.map(p=>p[0])));
    const top=Math.max(0,Math.min(...projected.map(p=>p[1]))),bottom=Math.min(cssHeight,Math.max(...projected.map(p=>p[1])));
    if (![left,right,top,bottom].every(Number.isFinite)) return null;
    if (right<=left||bottom<=top) continue;
    const rects=result.get(glyph.labelIndex)??[];rects.push({left,top,right,bottom});result.set(glyph.labelIndex,rects);
  }
  return [...result].map(([labelIndex,rects])=>({labelIndex,rects}));
}
