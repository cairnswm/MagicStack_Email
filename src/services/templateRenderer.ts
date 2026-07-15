import { evaluateExpression } from './templateExpression';
import {
  escapeHtml,
  isTruthy,
  resolvePath,
  TemplateRenderError,
} from './templateShared';
import type {
  RenderContext,
  RenderTemplateOptions,
  TemplateObject,
  TemplateValue,
} from './templateShared';

type TemplateNode =
  | { type: 'text'; value: string }
  | { type: 'expr'; expression: string }
  | { type: 'if'; condition: string; thenNodes: TemplateNode[]; elseNodes: TemplateNode[] }
  | { type: 'each'; source: string; alias: string; body: TemplateNode[] };

function parseNodes(template: string, start = 0, stopOn?: string, inEach = false): { nodes: TemplateNode[]; index: number; endedBy?: string } {
  const nodes: TemplateNode[] = [];
  let index = start;

  while (index < template.length) {
    const open = template.indexOf('{{', index);
    if (open === -1) {
      nodes.push({ type: 'text', value: template.slice(index) });
      return { nodes, index: template.length };
    }

    if (open > index) {
      nodes.push({ type: 'text', value: template.slice(index, open) });
    }

    const close = template.indexOf('}}', open + 2);
    if (close === -1) throw new TemplateRenderError('Unterminated template tag');

    const rawTag = template.slice(open + 2, close).trim();
    index = close + 2;

    if (stopOn && rawTag === stopOn) {
      return { nodes, index, endedBy: rawTag };
    }

    if (rawTag === 'else') {
      return { nodes, index, endedBy: 'else' };
    }

    if (rawTag.startsWith('#if ')) {
      const condition = rawTag.slice(4).trim();
      const thenResult = parseNodes(template, index, '/if', inEach);
      let elseNodes: TemplateNode[] = [];
      index = thenResult.index;
      if (thenResult.endedBy === 'else') {
        const elseResult = parseNodes(template, index, '/if', inEach);
        elseNodes = elseResult.nodes;
        index = elseResult.index;
        if (elseResult.endedBy !== '/if') throw new TemplateRenderError('Missing {{/if}} closing tag');
      } else if (thenResult.endedBy !== '/if') {
        throw new TemplateRenderError('Missing {{/if}} closing tag');
      }
      nodes.push({ type: 'if', condition, thenNodes: thenResult.nodes, elseNodes });
      continue;
    }

    if (rawTag.startsWith('#each ')) {
      if (inEach) throw new TemplateRenderError('Nested loops are not supported');
      const match = rawTag.match(/^#each\s+([A-Za-z_][A-Za-z0-9_.]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/);
      if (!match) throw new TemplateRenderError('Invalid each syntax. Use {{#each some.path as alias}}');
      const source = match[1];
      const alias = match[2];
      const bodyResult = parseNodes(template, index, '/each', true);
      if (bodyResult.endedBy !== '/each') throw new TemplateRenderError('Missing {{/each}} closing tag');
      index = bodyResult.index;
      nodes.push({ type: 'each', source, alias, body: bodyResult.nodes });
      continue;
    }

    if (rawTag.startsWith('/') || rawTag.startsWith('#')) {
      throw new TemplateRenderError(`Unexpected block tag '{{${rawTag}}}'`);
    }

    nodes.push({ type: 'expr', expression: rawTag });
  }

  if (stopOn) throw new TemplateRenderError(`Missing closing tag '{{${stopOn}}}'`);
  return { nodes, index };
}

function renderNodes(nodes: TemplateNode[], ctx: RenderContext, options: Required<RenderTemplateOptions>): string {
  let output = '';

  for (const node of nodes) {
    if (node.type === 'text') {
      output += node.value;
      continue;
    }

    if (node.type === 'expr') {
      const value = evaluateExpression(node.expression, ctx);
      if (value === null || value === undefined) continue;
      const text = String(value);
      output += options.escapeHtml ? escapeHtml(text) : text;
      continue;
    }

    if (node.type === 'if') {
      const condition = evaluateExpression(node.condition, ctx);
      output += renderNodes(isTruthy(condition) ? node.thenNodes : node.elseNodes, ctx, options);
      continue;
    }

    const sourceValue = resolvePath(node.source, ctx);
    if (!Array.isArray(sourceValue) || sourceValue.length === 0) continue;
    for (const item of sourceValue as TemplateValue[]) {
      output += renderNodes(node.body, { data: ctx.data, aliases: { ...ctx.aliases, [node.alias]: item } }, options);
    }
  }

  return output;
}

function applyWhitespaceOptions(input: string, options: Required<RenderTemplateOptions>): string {
  let output = input;
  if (options.removeSpaceBeforePunctuation) {
    output = output.replace(/\s+([,.;!?])/g, '$1');
  }
  if (options.removeEmptyLines) {
    output = output.replace(/^\s*\n/gm, '');
  }
  if (options.collapseWhitespace) {
    output = output.replace(/\s+/g, ' ').trim();
  }
  return output;
}

function renderTemplate(template: string, data: TemplateObject, options?: RenderTemplateOptions): string {
  const resolvedOptions: Required<RenderTemplateOptions> = {
    escapeHtml: options?.escapeHtml ?? false,
    removeSpaceBeforePunctuation: options?.removeSpaceBeforePunctuation ?? false,
    removeEmptyLines: options?.removeEmptyLines ?? false,
    collapseWhitespace: options?.collapseWhitespace ?? false,
  };

  const { nodes } = parseNodes(template);
  const rendered = renderNodes(nodes, { data, aliases: {} }, resolvedOptions);
  return applyWhitespaceOptions(rendered, resolvedOptions);
}

export { renderTemplate };
export type { RenderTemplateOptions, TemplateObject };
