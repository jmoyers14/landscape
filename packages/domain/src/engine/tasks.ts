import type { LineItemView } from "./calc.ts";

/**
 * A task group for display: a named grouping owning a mix of labor and material
 * lines, carrying the three money columns the workbook shows on a task row —
 * `M` (materials), `P` (labor), and `Q`, their combined total.
 */
export interface TaskGroup {
  kind: "group";
  key: string;
  name: string;
  lines: LineItemView[];
  materialCost: number;
  laborCost: number;
  total: number; // materialCost + laborCost — the workbook's Q
}

/** An ungrouped line, shown on its own. */
export interface LooseLine {
  kind: "loose";
  line: LineItemView;
}

export type LineBlock = TaskGroup | LooseLine;

/**
 * Buckets one assembly's lines into task groups by `taskKey`, keeping each group
 * at the position of its first line. Ungrouped lines stay loose.
 *
 * Lives here rather than in the web layer because it sums money, and money is
 * summed in exactly one package — the one that has tests. It only ever adds up
 * each line's already-computed `cost`; it never re-derives a figure.
 */
export function summarizeTasks(lines: LineItemView[]): LineBlock[] {
  const blocks: LineBlock[] = [];
  const byKey = new Map<string, TaskGroup>();

  for (const line of lines) {
    if (line.taskKey == null) {
      blocks.push({ kind: "loose", line });
      continue;
    }

    let group = byKey.get(line.taskKey);
    if (!group) {
      group = {
        kind: "group",
        key: line.taskKey,
        name: line.taskName ?? line.taskKey,
        lines: [],
        materialCost: 0,
        laborCost: 0,
        total: 0,
      };
      byKey.set(line.taskKey, group);
      blocks.push(group);
    }

    group.lines.push(line);
    if (line.type === "labor") {
      group.laborCost += line.cost;
    } else {
      group.materialCost += line.cost;
    }
    group.total += line.cost;
  }

  return blocks;
}
