type InputProperty = { type: 'string'; enum?: string[]; maxLength?: number } | { type: 'number' };

interface ModelContext {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties: Record<string, InputProperty>; required?: string[]; additionalProperties: false };
    annotations: { readOnlyHint: boolean };
    execute(input: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
  }, options: { signal: AbortSignal }): Promise<void>;
}

interface ToolPolicy {
  features?(): string[];
  allowsFeature?(name: string): boolean;
}

export function modelContext() {
  if (!window.isSecureContext) return;
  try {
    const current = document as Document & {
      modelContext?: ModelContext;
      permissionsPolicy?: ToolPolicy;
      featurePolicy?: ToolPolicy;
    };
    const policy = current.permissionsPolicy ?? current.featurePolicy;
    if (policy?.features?.().includes('tools') && policy.allowsFeature?.('tools') === false) return;
    const api = current.modelContext;
    if (typeof api?.registerTool === 'function') return api;
  } catch {
    // A browser or its Permissions Policy can deny access to the API.
  }
}

export function plainInput(input: unknown): input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null) return false;
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

export const browserToolFailure = (code: string, message: string) => ({ error: { code, message } });
