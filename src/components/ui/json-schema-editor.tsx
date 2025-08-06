import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

interface JsonSchemaEditorProps {
  value: string
  onChange: (value: string) => void
}

export const DEFAULT_JSON_SCHEMA = JSON.stringify(
  {
    name: "response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        answer: { type: "string" }
      },
      required: ["answer"],
      additionalProperties: false
    }
  },
  null,
  2
)

export function JsonSchemaEditor({ value, onChange }: JsonSchemaEditorProps) {
  const [error, setError] = useState<string | null>(null)

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(value || "{}")
      onChange(JSON.stringify(parsed, null, 2))
      setError(null)
    } catch {
      setError("Invalid JSON")
    }
  }

  const handleUseExample = () => {
    onChange(DEFAULT_JSON_SCHEMA)
    setError(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={handleFormat}>
          Format JSON
        </Button>
        <Button type="button" variant="outline" onClick={handleUseExample}>
          Use Example
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-48 font-mono text-sm"
        placeholder={DEFAULT_JSON_SCHEMA}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
