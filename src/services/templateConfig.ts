type TemplateConfig = Record<string, unknown>;

function assertTemplateConfigObject(value: unknown): TemplateConfig {
  if (!value) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Template config must be a JSON object');
  }

  return value as TemplateConfig;
}

export function parseTemplateConfig(rawConfig: unknown): TemplateConfig {
  if (rawConfig === null || rawConfig === undefined || rawConfig === '') {
    return {};
  }

  if (typeof rawConfig === 'string') {
    try {
      const parsed = JSON.parse(rawConfig);
      return assertTemplateConfigObject(parsed);
    } catch (err) {
      throw new Error(`Invalid template config JSON: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return assertTemplateConfigObject(rawConfig);
}

export function serializeTemplateConfig(rawConfig: unknown): string | null {
  if (rawConfig === undefined || rawConfig === null) {
    return null;
  }

  return JSON.stringify(assertTemplateConfigObject(rawConfig));
}

export function isTemplateDebugEnabled(config: TemplateConfig): boolean {
  const debug = config.debug;
  return debug === true || debug === 1 || debug === '1' || debug === 'true';
}

export type { TemplateConfig };