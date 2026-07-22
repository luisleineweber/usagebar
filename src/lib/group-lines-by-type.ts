type GroupableLine = {
  type: "text" | "progress" | "badge"
  label: string
}

export type MetricLineTypeGroup<T extends GroupableLine = GroupableLine> = {
  kind: "text" | "other"
  lines: T[]
}

/** Groups adjacent text rows while preserving the original provider order. */
export function groupLinesByType<T extends GroupableLine>(lines: T[]): MetricLineTypeGroup<T>[] {
  return lines.reduce<MetricLineTypeGroup<T>[]>((groups, line) => {
    const kind = line.type === "text" ? "text" : "other"
    const previous = groups[groups.length - 1]
    if (previous?.kind === kind) previous.lines.push(line)
    else groups.push({ kind, lines: [line] })
    return groups
  }, [])
}
