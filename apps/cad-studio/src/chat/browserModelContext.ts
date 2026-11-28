export type InputProperty = { type: 'string'; enum?: string[]; minLength?: number; maxLength?: number; pattern?: string }
  | { type: 'number'; minimum?: number; maximum?: number; exclusiveMinimum?: number; exclusiveMaximum?: number };

const revisionPattern = /^[a-f0-9]{16}$/;
export const browserRevisionField = { type: 'string', minLength: 16, maxLength: 16, pattern: revisionPattern.source } as const;
export const browserBodyField = { type: 'string', minLength: 1, maxLength: 128 } as const;

export function validBrowserRevision(value: unknown): value is string {
  return typeof value === 'string' && value.length === browserRevisionField.maxLength && revisionPattern.test(value);
}

export function validBrowserBody(value: unknown): value is string {
  return typeof value === 'string' && value.length >= browserBodyField.minLength && value.length <= browserBodyField.maxLength;
}

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
