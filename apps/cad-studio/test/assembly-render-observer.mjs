// Observe the existing WebGPU viewer after it submits a Studio canvas frame.
// The snapshot records viewer mesh state. It does not measure raster coverage or GPU timing.
export async function installAssemblyRenderObserver(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('.viewport[data-renderer="webgpu"] canvas.vp-canvas');
    const viewer = window.__studioViewer;
    if (!canvas || viewer?.canvas !== canvas || typeof viewer.render !== 'function' || !Array.isArray(viewer.meshList)) {
      throw new Error('Assembly render observer requires the live Studio WebGPU viewer');
    }
    if (window.__assemblyRenderObserver) throw new Error('Assembly render observer is already installed');

    const original = viewer.render;
    const descriptor = Object.getOwnPropertyDescriptor(viewer, 'render');
    let latest = null;
    let observerError = null;

    function snapshot(frame) {
      const grouped = new Map();
      for (const mesh of viewer.meshList) {
        if (!mesh.name?.startsWith('inst:')) continue;
        const topology = mesh.geometry.topology;
        if (topology !== 'triangles' && topology !== 'lines') continue;
        const id = mesh.name.slice('inst:'.length);
        if (!grouped.has(id)) grouped.set(id, { id, surfaces: [], edges: [] });
        const { opacity, lineWidth, color, colorWrite } = mesh.material;
        const state = {
          meshId: mesh.id,
          visible: mesh.visible,
          opacity: opacity ?? 1,
          colorWrite: colorWrite !== false,
          transform: Array.from(mesh.transform),
        };
        const instance = grouped.get(id);
        if (topology === 'triangles') instance.surfaces.push(state);
        else instance.edges.push({ ...state, lineWidth, color: typeof color === 'string' ? color : [...color] });
      }

      const instances = [...grouped.values()].sort((a, b) => a.id.localeCompare(b.id));
      const shown = mesh => mesh.visible && mesh.opacity > 0 && mesh.colorWrite;
      // The fixture uses solids with native edges. Studio paints highlighted instance edges at 3.4 CSS pixels.
      const highlightWidth = 3.4;
      const camera = viewer.camera;
      return {
        frame,
        renderer: 'webgpu',
        instances,
        visibleIds: instances.filter(i => [...i.surfaces, ...i.edges].some(shown)).map(i => i.id),
        highlightedIds: instances.filter(i => i.edges.some(e => shown(e) && e.lineWidth === highlightWidth)).map(i => i.id),
        // UI selection is independent of the renderer accent, which combines selection and step highlights.
        selectedIds: [...document.querySelectorAll('[data-browser-instance-path].sel')].map(row => row.dataset.browserInstancePath).sort(),
        camera: { position: [...camera.position], target: [...camera.target], projection: camera.projection, fovY: camera.fovY },
      };
    }

    function render(...args) {
      const frame = viewer.stats.frames;
      const result = Reflect.apply(original, this, args);
      if (this === viewer && args[0] === undefined && viewer.stats.frames > frame) {
        try { latest = snapshot(viewer.stats.frames); } catch (error) { observerError ??= String(error); }
      }
      return result;
    }

    Object.defineProperty(viewer, 'render', { value: render, configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false });
    window.__assemblyRenderObserver = {
      read() {
        if (observerError) throw new Error(`Assembly render snapshot failed: ${observerError}`);
        if (window.__studioViewer !== viewer) throw new Error('Studio replaced the observed WebGPU viewer');
        return latest;
      },
      restore() {
        if (Object.getOwnPropertyDescriptor(viewer, 'render')?.value !== render) return false;
        if (descriptor) Object.defineProperty(viewer, 'render', descriptor);
        else delete viewer.render;
        delete window.__assemblyRenderObserver;
        return true;
      },
    };
  });
}
