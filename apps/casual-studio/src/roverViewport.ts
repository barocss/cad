import type { ReviewPart, Vec3 } from './roverAssembly';

const vertex = `#version 300 es
layout(location=0) in vec3 p;
layout(location=1) in vec3 n;
uniform vec3 uRight, uUp, uEye, uShift, uCentre;
uniform vec2 uScale;
uniform float uDepth;
out vec3 normal;
void main() {
  vec3 v = p + uShift - uCentre;
  gl_Position = vec4(dot(v,uRight)*uScale.x, dot(v,uUp)*uScale.y, -dot(v,uEye)*uDepth, 1.);
  normal = n;
}`;
const fragment = `#version 300 es
precision highp float;
in vec3 normal;
uniform vec3 uColor;
uniform bool uFlat;
out vec4 color;
void main() {
  float light = uFlat ? 1. : .72 + .28 * max(0.,dot(normalize(normal),normalize(vec3(.55,-.6,1.))));
  color = vec4(light * uColor, 1.);
}`;
const rgb = (color: string): Vec3 => /^#[a-f\d]{6}$/i.test(color)
  ? [1,3,5].map(i => parseInt(color.slice(i, i+2), 16) / 255) as Vec3 : [.53,.62,.71];
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((value, i) => value + (b[i] - value) * t) as Vec3;

export function roverViewport(canvas: HTMLCanvasElement, all: readonly ReviewPart[], onPick: (id: string | null) => void) {
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!context) return null;
  const gl = context;
  const shaders = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, i) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, i === 0 ? vertex : fragment); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Assembly shader failed');
    return shader;
  });
  const program = gl.createProgram()!;
  for (const shader of shaders) gl.attachShader(program, shader);
  gl.linkProgram(program);
  for (const shader of shaders) gl.deleteShader(shader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Assembly renderer failed');
  const uniform = (key: string) => gl.getUniformLocation(program, 'u' + key);
  const [right, up, eye, shift, centre, scale, depth, color, flat] =
    ['Right','Up','Eye','Shift','Centre','Scale','Depth','Color','Flat'].map(uniform);
  const buffer = (data: Float32Array | Uint32Array, target: number = gl.ARRAY_BUFFER) => {
    const b = gl.createBuffer()!;
    gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b;
  };
  const models = new Map(all.map((part, i) => {
    const { mesh } = part;
    return [part.id, { index: i+1, color: rgb(part.color), points: buffer(Float32Array.from(mesh.positions)), normals: buffer(mesh.normals),
      faces: buffer(Uint32Array.from(mesh.indices), gl.ELEMENT_ARRAY_BUFFER), edges: buffer(Float32Array.from(mesh.edgeLines)) }];
  }));
  const box = (exploded: boolean) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const part of all) for (let d = 0; d < 3; d++) {
      const offset = exploded ? part.offset[d] : 0;
      lo[d] = Math.min(lo[d], part.mesh.bounds.min[d] + offset);
      hi[d] = Math.max(hi[d], part.mesh.bounds.max[d] + offset);
    }
    const middle = lo.map((v, i) => (v + hi[i]) / 2) as Vec3;
    return { middle, spans: hi.map((v,i) => (v-lo[i])/2) as Vec3 };
  };
  const framed = [box(false), box(true)];
  let yaw = -.73, pitch = .51;
  let visible: readonly ReviewPart[] = [];
  let highlighted: ReadonlySet<string> = new Set();
  let selected: string | null = null, exploded = false;
  const zero: Vec3 = [0, 0, 0];
  let pickTarget: { framebuffer: WebGLFramebuffer; colors: WebGLTexture; depth: WebGLRenderbuffer; width: number; height: number } | undefined;
  function pickPixel(x: number, y: number): number | undefined {
    // Single-sampled ID target: the antialiased display must not average two
    // adjacent IDs into the ID of an unrelated occurrence.
    const w=canvas.width, h=canvas.height;
    pickTarget ??= { framebuffer:gl.createFramebuffer()!, colors:gl.createTexture()!, depth:gl.createRenderbuffer()!, width:0, height:0 };
    const target=pickTarget;
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);
    try {
      if (target.width!==w || target.height!==h) {
        gl.bindTexture(gl.TEXTURE_2D,target.colors);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.colors,0);
        gl.bindRenderbuffer(gl.RENDERBUFFER,target.depth);
        gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,target.depth);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) return;
        target.width=w;target.height=h;
      }
      gl.enable(gl.SCISSOR_TEST);gl.scissor(x,y,1,1);pass(true);
      const rgba=new Uint8Array(4);
      gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
      return rgba[3]===255 ? rgba[0] : undefined;
    } finally {
      gl.disable(gl.SCISSOR_TEST);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
  }
  function pass(picking = false) {
    if (gl.isContextLost()) return;
    const w = canvas.width, h = canvas.height;
    const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    const r: Vec3 = [-sy, cy, 0], u: Vec3 = [-cy*sp,-sy*sp,cp], e: Vec3 = [cy*cp,sy*cp,sp];
    const { middle, spans } = framed[Number(exploded)];
    const extent = (dir: Vec3) => dir.reduce((value, v, i) => value + Math.abs(v) * spans[i], 0);
    const s = Math.min(.88*w/Math.max(1,extent(r)), .84*h/Math.max(1,extent(u)));
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.DITHER);
    gl.useProgram(program);
    gl.uniform3fv(right,r); gl.uniform3fv(up,u); gl.uniform3fv(eye,e); gl.uniform3fv(centre,middle);
    gl.uniform2f(scale,s/w,s/h); gl.uniform1f(depth,.9/Math.max(1,extent(e)));
    const attr = (slot: number, data: WebGLBuffer) => {
      gl.bindBuffer(gl.ARRAY_BUFFER,data); gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot,3,gl.FLOAT,false,0,0);
    };
    // Offset only surfaces; actual native edges remain depth-tested and never
    // draw through other parts. The pick pass deliberately has no edge strokes.
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
    for (const part of visible) {
      const item = models.get(part.id)!;
      const chosen = part.id === selected;
      const value = picking ? [item.index/255,0,0] : chosen ? mix(item.color,[.13,.44,1],.61)
        : highlighted.has(part.id) ? mix(item.color,[.29,.61,1],.46) : item.color;
      gl.uniform3fv(shift,exploded ? part.offset : zero);
      gl.uniform3fv(color,value); gl.uniform1i(flat,Number(picking));
      attr(0,item.points); attr(1,item.normals);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,item.faces);
      gl.drawElements(gl.TRIANGLES,part.mesh.indices.length,gl.UNSIGNED_INT,0);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    if (picking) return;
    gl.uniform1i(flat,1); gl.disableVertexAttribArray(1); gl.vertexAttrib3f(1,0,0,1);
    for (const part of visible) {
      if (!part.mesh.edgeLines.length) continue;
      gl.uniform3fv(shift,exploded ? part.offset : zero);
      gl.uniform3fv(color, part.id === selected ? [.04,.22,.58] : highlighted.has(part.id) ? [.13,.33,.59] : [.18,.24,.3]);
      attr(0,models.get(part.id)!.edges);
      gl.drawArrays(gl.LINES,0,part.mesh.edgeLines.length / 3);
    }
  }
  const resize = new ResizeObserver(() => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth*dpr), h = Math.round(canvas.clientHeight*dpr);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; }
    pass();
  });
  resize.observe(canvas);
  let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
  const turn = (nextYaw: number, nextPitch: number) => { yaw=nextYaw; pitch=Math.max(.05,Math.min(1.38,nextPitch)); pass(); };
  canvas.onpointerdown = e => {
    if (e.button !== 0) return;
    drag={x:e.clientX,y:e.clientY,yaw,pitch,moved:false}; canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = e => {
    if (!drag) return;
    const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
    if (Math.hypot(dx,dy)>4) drag.moved=true;
    if (drag.moved) turn(drag.yaw-dx*.007,drag.pitch+dy*.007);
  };
  canvas.onpointercancel = () => { drag=null; };
  canvas.onpointerup = e => {
    const released=drag; drag=null;
    if (!released || released.moved || gl.isContextLost()) return;
    const rect=canvas.getBoundingClientRect();
    const x=Math.floor((e.clientX-rect.left)*canvas.width/rect.width);
    const y=canvas.height-1-Math.floor((e.clientY-rect.top)*canvas.height/rect.height);
    if (x<0 || x>=canvas.width || y<0 || y>=canvas.height) return;
    const index=pickPixel(x,y);
    const hit=index ? all[index-1]?.id : undefined;
    onPick(hit && visible.some(part => part.id===hit) ? hit : null);
  };
  canvas.onkeydown = e => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    turn(yaw + (e.key==='ArrowLeft' ? .12 : e.key==='ArrowRight' ? -.12 : 0),
      pitch + (e.key==='ArrowUp' ? .1 : e.key==='ArrowDown' ? -.1 : 0));
  };
  return {
    show(parts: readonly ReviewPart[], active: ReadonlySet<string>, picked: string | null, separated: boolean) {
      visible=parts; highlighted=active; selected=picked; exploded=separated; pass();
    },
    reset() { turn(-.73,.51); },
    dispose() {
      resize.disconnect();
      canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=null;
      canvas.onkeydown=null;
      for (const model of models.values()) for (const b of [model.points, model.normals, model.faces, model.edges]) gl.deleteBuffer(b);
      gl.deleteProgram(program);
      if (pickTarget) {
        gl.deleteFramebuffer(pickTarget.framebuffer);gl.deleteTexture(pickTarget.colors);gl.deleteRenderbuffer(pickTarget.depth);
      }
    },
  };
}
