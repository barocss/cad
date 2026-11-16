/** Local library-file admission only. Registration remains synchronous and belongs to the caller. */
export function createLibraryFileReader() {
  let generation = 0;
  return {
    /** Retire pending reads; future reads remain usable after StrictMode effect cleanup/replay. */
    cancel() { generation++; },
    async read(file: { text(): Promise<string> }, onValue: (value: unknown) => void, onError: (cause: unknown) => void): Promise<void> {
      const ticket = ++generation;
      try {
        const text = await file.text();
        if (ticket !== generation) return;
        // No await between ownership validation, parsing and the caller's registry/store update.
        onValue(JSON.parse(text) as unknown);
      } catch (cause) {
        if (ticket === generation) onError(cause);
      }
    },
  };
}
