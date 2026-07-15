type TemplateScalar = string | number | boolean | null | undefined;
type TemplateValue = TemplateScalar | TemplateObject | TemplateValue[];
type TemplateObject = { [key: string]: TemplateValue };

interface RenderContext {
  data: TemplateObject;
  aliases: Record<string, TemplateValue>;
}

interface RenderTemplateOptions {
  escapeHtml?: boolean;
  removeSpaceBeforePunctuation?: boolean;
  removeEmptyLines?: boolean;
  collapseWhitespace?: boolean;
}

class TemplateRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateRenderError';
  }
}

function isTruthy(value: TemplateValue): boolean {
  return !(value === null || value === undefined || value === '' || value === false);
}

function isNumber(value: TemplateValue): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolvePath(path: string, ctx: RenderContext): TemplateValue {
  const parts = path.split('.');
  if (parts.length === 0) return undefined;

  const root = parts[0];
  let current: TemplateValue = Object.prototype.hasOwnProperty.call(ctx.aliases, root)
    ? ctx.aliases[root]
    : ctx.data[root];

  for (let i = 1; i < parts.length; i += 1) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as TemplateObject)[parts[i]];
  }

  return current;
}

export {
  escapeHtml,
  isNumber,
  isTruthy,
  resolvePath,
  TemplateRenderError,
};

export type {
  RenderContext,
  RenderTemplateOptions,
  TemplateObject,
  TemplateScalar,
  TemplateValue,
};
