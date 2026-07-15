# How to Use the Template Language

This guide explains how to write templates and how rendering options affect output formatting.

## What This Template Language Is

The template language turns a template string plus a data object into final text (or HTML). The renderer evaluates placeholders, conditions, loops, and simple math, then returns a single rendered string.

Main entry point:

- renderTemplate(template, data, options?)

You can use it directly in code or through API endpoints such as `POST /template/render` and `POST /template` (render mode).

## Core Syntax

### 1. Value Output

Use double braces to output values:

```text
Hello {{ customer.first_name }}
```

Nested properties are supported (`customer.address.city`). Missing values render as empty output.

### 2. Default Values

Use `??` for null/undefined fallback:

```text
{{ customer.first_name ?? "Customer" }}
```

Fallback only triggers for `null` or `undefined`, not for `0`, `false`, or empty string.

### 3. Calculations

Simple arithmetic is supported:

```text
{{ item.price * item.quantity }}
{{ (order.subtotal + order.tax) - order.discount }}
{{ order.subtotal / order.divisor ?? 0 }}
```

Rules:

- Operands must be numeric.
- Division by zero returns empty unless fallback is provided.
- Invalid expressions throw a render error.

### 4. Conditions and Comparisons

Supported operators:

- Comparison: `==`, `!=`, `>`, `<`, `>=`, `<=`
- Boolean: `&&`, `||`, `!`

Examples:

```text
{{ order.paid ? "Paid" : "Payment required" }}
{{ customer.email && customer.first_name ? "Complete" : "Incomplete" }}
```

### 5. If/Else Blocks

```text
{{#if order.paid}}
Payment received.
{{else}}
Payment required.
{{/if}}
```

Nested `if` blocks are supported.

### 6. Loops

Use `each` for arrays:

```text
{{#each order.items as item}}
- {{ item.quantity }} x {{ item.name }} = {{ item.price * item.quantity ?? 0 }}
{{/each}}
```

If the source is missing, not an array, or empty, no output is produced.

## Render Options

Options control post-render formatting and escaping:

- `escapeHtml` (default: false)
- `removeSpaceBeforePunctuation` (default: false)
- `removeEmptyLines` (default: false)
- `collapseWhitespace` (default: false)

Example:

```json
{
  "options": {
    "escapeHtml": true,
    "removeSpaceBeforePunctuation": false,
    "removeEmptyLines": false,
    "collapseWhitespace": false
  }
}
```

### Option Details

- `escapeHtml: true`
  - Escapes output values such as `<`, `>`, `&`, quotes.
  - Recommended for HTML templates when data may contain unsafe characters.

- `removeSpaceBeforePunctuation: true`
  - Converts patterns like `"Hello , world !"` to `"Hello, world!"`.

- `removeEmptyLines: true`
  - Removes blank lines that appear after optional blocks are omitted.

- `collapseWhitespace: true`
  - Collapses all whitespace runs (spaces/newlines/tabs) into single spaces and trims ends.
  - Best for compact plain text; avoid for layout-sensitive formatting.

## Recommended Defaults by Use Case

- Human-readable previews: keep all formatting options false.
- Clean plain-text output: set `removeSpaceBeforePunctuation` and `removeEmptyLines` true.
- Compact single-line output: set `collapseWhitespace` true.
- HTML email rendering: set `escapeHtml` true unless values are fully trusted.

## Common Limits and Guardrails

Not supported:

- Function calls
- Assignments
- Nested loops
- Nested ternary expressions
- Dynamic property access
- Arbitrary code execution

The parser is intentionally restricted and does not use `eval`.

## Practical Invoice Example

```text
Invoice {{ order.reference ?? "N/A" }}
Status: {{ order.paid ? "Paid" : "Payment required" }}

{{#each order.items as item}}
- {{ item.quantity }} x {{ item.name }} = {{ item.quantity * item.price ?? 0 }}
{{/each}}

Total: {{ (order.subtotal + order.tax) - order.discount ?? 0 }}
```

With order-style data, this produces clear, deterministic output and can be validated quickly through `POST /template/render`.
