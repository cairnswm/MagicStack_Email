# Simple Template Language

## Purpose

This language converts structured configuration data into plain text or HTML, primarily for emails.

It supports:

* Variable substitution
* Default values
* Conditional expressions
* Conditional blocks
* Nested property access
* Array iteration
* Simple numeric calculations

It is intentionally small and is not a general-purpose programming language.

---

## Data

Templates receive a data object.

```json
{
  "customer": {
    "first_name": "Amina"
  },
  "order": {
    "reference": "ORD-1042",
    "paid": true,
    "tax": 30,
    "items": [
      {
        "name": "Notebook",
        "price": 50,
        "quantity": 2
      }
    ]
  }
}
```

Supported values:

```typescript
string | number | boolean | null | undefined | object | array
```

---

## Output Expressions

Expressions are written inside double braces:

```text
{{ customer.first_name }}
```

Nested properties use dot notation:

```text
{{ order.reference }}
{{ order.delivery.address.city }}
```

A missing value outputs nothing.

Data values are inserted as plain text and are not processed as template syntax.

---

## Template Parts

Use a tenant-scoped template part to include reusable content:

```text
{{part.header}}
```

Manage parts through the administrator-protected `/template-parts` endpoints;
see the [endpoint reference](api-specification.md#template-part-management).

Parts are rendered as template content, so a part may contain its own placeholders, `if` blocks, and `each` blocks.

If the part does not exist or is inactive, it renders as empty output.

You may provide a nullish-style fallback when a part is missing:

```text
{{part.header ?? "[missing part: header]"}}
```

Fallback rules:

* The fallback is used only when the part is missing.
* Without a fallback, a missing part renders as empty output.
* The fallback is evaluated as a normal expression.
* Circular part references are not allowed.

Template debug mode may override the default silent behavior for missing parts. If the parent email template has `config_json` with `{"debug":1}`, missing parts without a fallback render a visible marker instead.

Supported debug-enabled values are `true`, `1`, `"1"`, and `"true"`.

---

## Default Values

Use the nullish fallback operator `??`:

```text
{{ customer.first_name ?? "Customer" }}
```

The fallback is used when the value is `null` or `undefined`.

An empty string, `false`, or `0` does not trigger the fallback.

Fallback values may be literals or expressions:

```text
{{ title ?? "Order confirmation" }}
{{ order.discount ?? customer.default_discount ?? 0 }}
```

---

## Calculations

Output expressions may contain simple numeric calculations:

```text
{{ item.price * item.quantity }}
```

Supported operators:

```text
+
-
*
/
( )
```

Examples:

```text
{{ order.subtotal + order.tax }}
{{ (item.price * item.quantity) - item.discount }}
```

A fallback may be applied to a calculation:

```text
{{ item.price * item.quantity ?? 0 }}
```

Calculation rules:

* All operands must resolve to numbers.
* Missing or non-numeric values output nothing unless a fallback is provided.
* Division by zero outputs nothing unless a fallback is provided.
* Invalid syntax is a template-rendering error.
* Expressions must use a restricted parser and must never use `eval()` or `Function()`.

Calculations are intended for simple display values. Authoritative totals, taxes, discounts, rounding, and currency conversion should normally be calculated before rendering.

---

## Comparisons

Expressions may compare values using:

```text
==
!=
>
<
>=
<=
```

Examples:

```text
item.quantity > 1
order.status == "paid"
customer.country != "ZA"
```

Comparisons return a boolean and are normally used in ternary expressions or conditional blocks.

Use `==` and `!=` syntax for equality checks.

Comparison behavior is strict by type (for example, `1` is not equal to `"1"`).

Strict JavaScript-style `===` and `!==` tokens are not supported.

---

## Boolean Operators

Conditions may use:

```text
&&
||
!
```

Examples:

```text
customer.email && customer.first_name
customer.email || customer.phone
!order.paid
```

Parentheses may be used to make precedence explicit:

```text
(order.paid && order.reference) || order.manual_review
```

Keep conditions short and readable.

---

## Ternary Expressions

Use a ternary expression for short conditional output:

```text
{{ order.paid ? "Paid" : "Payment required" }}
```

Comparisons may be used directly:

```text
{{ item.quantity > 1 ? "items" : "item" }}
```

The false branch may be omitted:

```text
{{ order.paid ? "Payment received" }}
```

When the condition is false, nothing is output.

Ternary branches may contain literals, property values, or calculations:

```text
{{ order.discount > 0 ? order.discount : 0 }}
```

Nested ternary expressions are not supported.

---

## Conditional Blocks

Use an `if` block for complete sentences, paragraphs, or HTML sections:

```text
{{#if order.paid}}
Payment has been received.
{{/if}}
```

Use `else` for alternative content:

```text
{{#if order.paid}}
Payment has been received.
{{else}}
Payment is still required.
{{/if}}
```

Conditions may contain property checks, comparisons, and boolean operators:

```text
{{#if order.total >= 1000}}
This order qualifies for free delivery.
{{/if}}
```

Conditional blocks may be nested.

---

## Array Iteration

Use an `each` block to repeat content for every item in an array:

```text
{{#each order.items as item}}
{{ item.quantity }} × {{ item.name }}
{{/each}}
```

The alias may be used in values, calculations, ternaries, and conditions:

```html
{{#each order.items as item}}
<li>
  {{ item.quantity }} × {{ item.name }} —
  {{ item.price * item.quantity }}
</li>
{{/each}}
```

If the value is missing, not an array, or empty, the block outputs nothing.

Nested loops are not supported.

---

## Example Email Template

```html
<p>Hello {{ customer.first_name ?? "Customer" }},</p>

{{#if order.reference}}
<p>
  Your order <strong>{{ order.reference }}</strong> has been received.
</p>
{{/if}}

<ul>
{{#each order.items as item}}
<li>
  {{ item.quantity }} × {{ item.name }} —
  {{ item.price * item.quantity }}
</li>
{{/each}}
</ul>

{{#if order.paid}}
<p>Payment has been received.</p>
{{else}}
<p>Payment is still required.</p>
{{/if}}

<p>
  This order contains
  {{ order.items.length > 1 ? "multiple items" : "one item" }}.
</p>

<p>Regards,<br>{{ company.name }}</p>
```

---

## Truthy and Falsy Values

The following values are falsy in conditions:

```text
null
undefined
""
false
```

All other values, including `0`, are truthy.

A comparison always produces `true` or `false`.

---

## Whitespace Processing

After rendering:

1. Spaces before punctuation may be removed.
2. Empty lines created by omitted blocks may be removed.
3. General whitespace collapsing should be configurable.

HTML templates should preserve intentional formatting by default.

---

## Escaping

Escaping is controlled by the renderer option `escapeHtml`.

When `escapeHtml` is enabled, inserted values and fallback output are HTML-escaped.

When `escapeHtml` is disabled, values are inserted as plain text.

In this service:

* Stored HTML templates are rendered with escaping enabled.
* Subject templates are rendered without HTML escaping.
* Inline preview templates use the provided render options; if omitted, escaping is disabled.

The language does not provide raw HTML insertion. Trusted HTML should be added through controlled template content rather than configuration values.

---

## Unsupported Features

The language does not support:

* Function calls
* Assignments
* Arbitrary code execution
* Recursive template expansion
* Nested loops
* Nested ternary expressions
* Dynamic property access
* String concatenation with `+`
* General-purpose scripting

---

## Recommended Usage

* Use output expressions for values and simple calculations.
* Use ternary expressions for short conditional text.
* Use `if` blocks for sentences, paragraphs, and HTML sections.
* Keep expressions short.
* Use loops only for simple repeated output.
* Perform validation, formatting, and business-critical calculations before rendering.
