import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  loadModelPriceOverrides,
  saveModelPriceOverrides,
  type ModelPriceOverrides,
} from "@/lib/report-pricing"

export function ReportPricingEditor({
  models,
  overrides,
  onChange,
}: {
  models: string[]
  overrides: ModelPriceOverrides
  onChange: (overrides: ModelPriceOverrides) => void
}) {
  const [model, setModel] = useState(models[0] ?? "")
  const current = overrides[model]
  const [input, setInput] = useState("")
  const [output, setOutput] = useState("")

  useEffect(() => {
    if (!models.includes(model)) setModel(models[0] ?? "")
  }, [model, models])
  useEffect(() => {
    setInput(current ? String(current.inputPerMillion) : "")
    setOutput(current ? String(current.outputPerMillion) : "")
  }, [current, model])

  if (models.length === 0) return null
  const save = async () => {
    const inputPerMillion = Number(input)
    const outputPerMillion = Number(output)
    if (!Number.isFinite(inputPerMillion) || !Number.isFinite(outputPerMillion)) return
    const next = { ...overrides, [model]: { inputPerMillion, outputPerMillion } }
    onChange(next)
    await saveModelPriceOverrides(next)
  }
  const clear = async () => {
    const next = { ...overrides }
    delete next[model]
    onChange(next)
    await saveModelPriceOverrides(next)
  }

  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground">Model pricing overrides</summary>
      <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-2">
        <select
          aria-label="Pricing override model"
          value={model}
          className="col-span-2 h-8 rounded-md border border-input bg-background px-2"
          onChange={(event) => setModel(event.target.value)}
        >
          {models.map((value) => <option key={value}>{value}</option>)}
        </select>
        <input
          aria-label="Input price per million tokens"
          type="number"
          min="0"
          step="0.01"
          placeholder="Input $/1M"
          value={input}
          className="h-8 min-w-0 rounded-md border border-input bg-background px-2"
          onChange={(event) => setInput(event.target.value)}
        />
        <input
          aria-label="Output price per million tokens"
          type="number"
          min="0"
          step="0.01"
          placeholder="Output $/1M"
          value={output}
          className="h-8 min-w-0 rounded-md border border-input bg-background px-2"
          onChange={(event) => setOutput(event.target.value)}
        />
        <Button type="button" size="xs" onClick={() => void save()}>Save price</Button>
        <Button type="button" size="xs" variant="outline" onClick={() => void clear()}>Use source price</Button>
      </div>
    </details>
  )
}

export { loadModelPriceOverrides }
