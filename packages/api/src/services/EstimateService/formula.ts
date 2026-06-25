import { Parser, type Expression } from "expr-eval";

/**
 * The formula engine. Quantity and labor-hour formulas are stored as text
 * (Option C — formulas are data, see docs/data-model.md) and evaluated here.
 *
 * expr-eval is sandboxed: a formula can only reach the variables we pass in and
 * the functions we register below — never JS globals — so user-authored
 * formulas are safe to evaluate server-side.
 */

// A single shared parser. The registered functions mirror the Excel functions
// the source spreadsheet uses, so a formula reads like its spreadsheet origin.
// round/roundUp/roundDown take an optional decimal-places arg, like Excel's
// ROUND/ROUNDUP/ROUNDDOWN (the sheet uses both 0- and 1-place rounding).
const parser = new Parser();
// expr-eval registers round/ceil/floor as unary operators too (so `round 1.5`
// parses), which makes the parser reject the 2-arg `round(x, places)` form.
// Drop the unary alias so `round` is purely a vararg function.
delete (parser as unknown as { unaryOps: Record<string, unknown> }).unaryOps
  .round;
const fns = parser.functions as Record<string, (...args: number[]) => number>;
fns.round = (x, places = 0) => roundTo(Math.round, x, places);
fns.roundUp = (x, places = 0) => roundTo(Math.ceil, x, places);
fns.roundDown = (x, places = 0) => roundTo(Math.floor, x, places);
// Excel EVEN(): round away from zero to the next even integer.
fns.even = (x) => {
  let n = Math.ceil(Math.abs(x));
  if (n % 2 !== 0) {
    n += 1;
  }
  return x < 0 ? -n : n;
};

function roundTo(op: (n: number) => number, x: number, places: number): number {
  const factor = 10 ** places;
  return op(x * factor) / factor;
}

/** Thrown for any unusable formula: a parse error, a bad value, or a cycle. */
export class FormulaError extends Error {
  constructor(
    message: string,
    readonly formula?: string,
  ) {
    super(formula ? `${message} (in "${formula}")` : message);
    this.name = "FormulaError";
  }
}

function compile(formula: string): Expression {
  try {
    return parser.parse(formula);
  } catch (error) {
    throw new FormulaError(
      `Could not parse formula: ${(error as Error).message}`,
      formula,
    );
  }
}

/** Evaluate one formula against a variable scope, validating the result. */
export function evaluate(
  formula: string,
  scope: Record<string, number>,
): number {
  const expr = compile(formula);
  let result: unknown;
  try {
    result = expr.evaluate(scope);
  } catch (error) {
    throw new FormulaError(
      `Could not evaluate formula: ${(error as Error).message}`,
      formula,
    );
  }
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new FormulaError(`Formula did not produce a finite number`, formula);
  }
  return result;
}

export interface ResolvableLine {
  key: string;
  quantityFormula: string;
}

/**
 * Resolve every line's quantity, honoring cross-line references. A formula may
 * reference driver keys and the keys of other lines (the spreadsheet chains
 * cells constantly — pop-up bodies depend on heads depend on zones). Lines are
 * evaluated in dependency order; an unknown variable or a reference cycle is a
 * FormulaError.
 *
 * Returns a map of line key -> resolved value.
 */
export function resolveQuantities(
  lines: ResolvableLine[],
  drivers: Record<string, number>,
): Map<string, number> {
  const lineByKey = new Map<string, ResolvableLine>();
  for (const line of lines) {
    if (lineByKey.has(line.key)) {
      throw new FormulaError(`Duplicate line key "${line.key}"`);
    }
    lineByKey.set(line.key, line);
  }

  const expressionByKey = new Map<string, Expression>();
  const dependenciesByKey = new Map<string, string[]>();
  for (const line of lines) {
    const expr = compile(line.quantityFormula);
    expressionByKey.set(line.key, expr);
    const dependencies: string[] = [];
    for (const variable of expr.variables({ withMembers: false })) {
      if (lineByKey.has(variable)) {
        dependencies.push(variable); // references another line
      } else if (!(variable in drivers)) {
        throw new FormulaError(
          `Unknown variable "${variable}"`,
          line.quantityFormula,
        );
      }
    }
    dependenciesByKey.set(line.key, dependencies);
  }

  const resolved = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (key: string): void => {
    if (resolved.has(key)) {
      return;
    }
    if (visiting.has(key)) {
      throw new FormulaError(`Formula reference cycle through "${key}"`);
    }
    visiting.add(key);
    const dependencies = dependenciesByKey.get(key) ?? [];
    for (const dependency of dependencies) {
      visit(dependency);
    }
    visiting.delete(key);

    const scope: Record<string, number> = { ...drivers };
    for (const [k, v] of resolved) {
      scope[k] = v;
    }
    const line = lineByKey.get(key)!;
    resolved.set(key, evaluate(line.quantityFormula, scope));
  };

  for (const line of lines) {
    visit(line.key);
  }
  return resolved;
}
