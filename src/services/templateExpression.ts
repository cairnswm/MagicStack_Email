import {
  isNumber,
  isTruthy,
  resolvePath,
  TemplateRenderError,
} from './templateShared';
import type { RenderContext, TemplateValue } from './templateShared';

type TokenType =
  | 'number'
  | 'string'
  | 'identifier'
  | 'true'
  | 'false'
  | 'null'
  | 'lparen'
  | 'rparen'
  | 'question'
  | 'colon'
  | 'not'
  | 'and'
  | 'or'
  | 'nullish'
  | 'eq'
  | 'ne'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'plus'
  | 'minus'
  | 'star'
  | 'slash'
  | 'eof';

interface Token {
  type: TokenType;
  value?: string;
}

function tokenizeExpression(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const push = (type: TokenType, value?: string): void => {
    tokens.push({ type, value });
  };

  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (input.startsWith('??', i)) { push('nullish'); i += 2; continue; }
    if (input.startsWith('&&', i)) { push('and'); i += 2; continue; }
    if (input.startsWith('||', i)) { push('or'); i += 2; continue; }
    if (input.startsWith('>=', i)) { push('gte'); i += 2; continue; }
    if (input.startsWith('<=', i)) { push('lte'); i += 2; continue; }
    if (input.startsWith('==', i)) { push('eq'); i += 2; continue; }
    if (input.startsWith('!=', i)) { push('ne'); i += 2; continue; }

    if (ch === '(') { push('lparen'); i += 1; continue; }
    if (ch === ')') { push('rparen'); i += 1; continue; }
    if (ch === '?') { push('question'); i += 1; continue; }
    if (ch === ':') { push('colon'); i += 1; continue; }
    if (ch === '!') { push('not'); i += 1; continue; }
    if (ch === '>') { push('gt'); i += 1; continue; }
    if (ch === '<') { push('lt'); i += 1; continue; }
    if (ch === '+') { push('plus'); i += 1; continue; }
    if (ch === '-') { push('minus'); i += 1; continue; }
    if (ch === '*') { push('star'); i += 1; continue; }
    if (ch === '/') { push('slash'); i += 1; continue; }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      let value = '';
      while (i < input.length && input[i] !== quote) {
        value += input[i];
        i += 1;
      }
      if (i >= input.length) throw new TemplateRenderError('Unterminated string literal');
      i += 1;
      push('string', value);
      continue;
    }

    if (/\d/.test(ch)) {
      let value = ch;
      i += 1;
      while (i < input.length && /[\d.]/.test(input[i])) {
        value += input[i];
        i += 1;
      }
      if (!/^\d+(\.\d+)?$/.test(value)) {
        throw new TemplateRenderError(`Invalid number literal '${value}'`);
      }
      push('number', value);
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let value = ch;
      i += 1;
      while (i < input.length && /[A-Za-z0-9_.]/.test(input[i])) {
        value += input[i];
        i += 1;
      }
      if (value === 'true') { push('true'); continue; }
      if (value === 'false') { push('false'); continue; }
      if (value === 'null') { push('null'); continue; }
      push('identifier', value);
      continue;
    }

    throw new TemplateRenderError(`Unsupported token '${ch}' in expression '${input}'`);
  }

  push('eof');
  return tokens;
}

class ExpressionParser {
  private readonly tokens: Token[];
  private cursor = 0;
  private readonly ctx: RenderContext;

  constructor(expression: string, ctx: RenderContext) {
    this.tokens = tokenizeExpression(expression);
    this.ctx = ctx;
  }

  parse(): TemplateValue {
    const value = this.parseTernary(true);
    this.expect('eof');
    return value;
  }

  private current(): Token { return this.tokens[this.cursor]; }
  private advance(): Token { const t = this.tokens[this.cursor]; this.cursor += 1; return t; }
  private match(type: TokenType): boolean { if (this.current().type !== type) return false; this.cursor += 1; return true; }
  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) throw new TemplateRenderError(`Expected ${type} but found ${token.type}`);
    this.cursor += 1;
    return token;
  }

  private parseTernary(allowTernary: boolean): TemplateValue {
    const condition = this.parseNullish();
    if (this.match('question')) {
      if (!allowTernary) throw new TemplateRenderError('Nested ternary expressions are not supported');
      const thenValue = this.parseTernary(false);
      if (!this.match('colon')) return isTruthy(condition) ? thenValue : undefined;
      const elseValue = this.parseTernary(false);
      return isTruthy(condition) ? thenValue : elseValue;
    }
    return condition;
  }

  private parseNullish(): TemplateValue {
    let value = this.parseOr();
    while (this.match('nullish')) {
      const right = this.parseOr();
      value = value === null || value === undefined ? right : value;
    }
    return value;
  }

  private parseOr(): TemplateValue {
    let value = this.parseAnd();
    while (this.match('or')) {
      const right = this.parseAnd();
      value = isTruthy(value) ? value : right;
    }
    return value;
  }

  private parseAnd(): TemplateValue {
    let value = this.parseComparison();
    while (this.match('and')) {
      const right = this.parseComparison();
      value = isTruthy(value) ? right : value;
    }
    return value;
  }

  private parseComparison(): TemplateValue {
    let value = this.parseAdditive();
    while (true) {
      const token = this.current();
      if (!['eq', 'ne', 'gt', 'lt', 'gte', 'lte'].includes(token.type)) break;
      this.advance();
      const right = this.parseAdditive();
      switch (token.type) {
      case 'eq': value = value === right; break;
      case 'ne': value = value !== right; break;
      case 'gt': value = isNumber(value) && isNumber(right) ? value > right : false; break;
      case 'lt': value = isNumber(value) && isNumber(right) ? value < right : false; break;
      case 'gte': value = isNumber(value) && isNumber(right) ? value >= right : false; break;
      case 'lte': value = isNumber(value) && isNumber(right) ? value <= right : false; break;
      }
    }
    return value;
  }

  private parseAdditive(): TemplateValue {
    let value = this.parseMultiplicative();
    while (true) {
      const token = this.current();
      if (token.type !== 'plus' && token.type !== 'minus') break;
      this.advance();
      const right = this.parseMultiplicative();
      if (!isNumber(value) || !isNumber(right)) {
        value = undefined;
        continue;
      }
      value = token.type === 'plus' ? value + right : value - right;
    }
    return value;
  }

  private parseMultiplicative(): TemplateValue {
    let value = this.parseUnary();
    while (true) {
      const token = this.current();
      if (token.type !== 'star' && token.type !== 'slash') break;
      this.advance();
      const right = this.parseUnary();
      if (!isNumber(value) || !isNumber(right)) {
        value = undefined;
        continue;
      }
      if (token.type === 'slash' && right === 0) {
        value = undefined;
        continue;
      }
      value = token.type === 'star' ? value * right : value / right;
    }
    return value;
  }

  private parseUnary(): TemplateValue {
    if (this.match('not')) {
      const value = this.parseUnary();
      return !isTruthy(value);
    }
    if (this.match('minus')) {
      const value = this.parseUnary();
      return isNumber(value) ? -value : undefined;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): TemplateValue {
    const token = this.current();
    if (this.match('number')) return Number(token.value);
    if (this.match('string')) return token.value ?? '';
    if (this.match('true')) return true;
    if (this.match('false')) return false;
    if (this.match('null')) return null;
    if (this.match('identifier')) return resolvePath(token.value || '', this.ctx);
    if (this.match('lparen')) {
      const value = this.parseTernary(true);
      this.expect('rparen');
      return value;
    }
    throw new TemplateRenderError(`Unexpected token ${token.type}`);
  }
}

function evaluateExpression(expression: string, ctx: RenderContext): TemplateValue {
  const parser = new ExpressionParser(expression, ctx);
  return parser.parse();
}

export { evaluateExpression };
