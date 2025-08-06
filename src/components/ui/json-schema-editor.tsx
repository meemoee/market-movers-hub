import { useEffect, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Trash2, Plus } from "lucide-react"

interface JsonSchemaEditorProps {
  value: string
  onChange: (value: string) => void
}

interface Field {
  name: string
  type: string
  required: boolean
}

const DEFAULT_FIELDS: Field[] = [{ name: "answer", type: "string", required: true }]

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
  const [schemaName, setSchemaName] = useState("response")
  const [fields, setFields] = useState<Field[]>(DEFAULT_FIELDS)
  const lastEmitted = useRef("")

  // Parse incoming value when it originates from parent
  useEffect(() => {
    if (!value || value === lastEmitted.current) return
    try {
      const parsed = JSON.parse(value)
      if (parsed?.name) setSchemaName(parsed.name)
      const properties = parsed?.schema?.properties || {}
      const required: string[] = parsed?.schema?.required || []
      const parsedFields: Field[] = Object.entries(properties).map(([name, prop]) => {
        const typedProp = prop as { type?: string }
        return {
          name,
          type: typeof typedProp.type === "string" ? typedProp.type : "string",
          required: required.includes(name)
        }
      })
      if (parsedFields.length) setFields(parsedFields)
    } catch {
      // ignore parse errors
    }
  }, [value])

  const schemaString = useMemo(() => {
    const schemaObj = {
      name: schemaName || "response",
      strict: true,
      schema: {
        type: "object",
        properties: fields.reduce<Record<string, { type: string }>>((acc, f) => {
          if (f.name.trim()) acc[f.name.trim()] = { type: f.type }
          return acc
        }, {}),
        required: fields.filter(f => f.required && f.name.trim()).map(f => f.name.trim()),
        additionalProperties: false
      }
    }
    return JSON.stringify(schemaObj, null, 2)
  }, [schemaName, fields])

  useEffect(() => {
    lastEmitted.current = schemaString
    onChange(schemaString)
  }, [schemaString, onChange])

  const updateField = (index: number, key: keyof Field, value: string | boolean) => {
    setFields(prev => prev.map((f, i) => i === index ? { ...f, [key]: value } : f))
  }

  const addField = () => setFields(prev => [...prev, { name: "", type: "string", required: true }])
  const removeField = (index: number) => setFields(prev => prev.filter((_, i) => i !== index))

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="schema-name" className="text-sm">Schema Name</Label>
        <Input id="schema-name" value={schemaName} onChange={e => setSchemaName(e.target.value)} placeholder="response" />
      </div>

      <div className="space-y-3">
        {fields.map((field, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <Input
              value={field.name}
              onChange={e => updateField(idx, "name", e.target.value)}
              placeholder="Field name"
              className="w-32"
            />
            <Select value={field.type} onValueChange={val => updateField(idx, "type", val)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`required-${idx}`}
                checked={field.required}
                onCheckedChange={val => updateField(idx, "required", val === true)}
              />
              <Label htmlFor={`required-${idx}`} className="text-sm">Required</Label>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => removeField(idx)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addField} className="mt-2">
          <Plus className="w-4 h-4 mr-1" /> Add Field
        </Button>
      </div>

      <div>
        <Label className="text-sm">Generated Schema</Label>
        <pre className="bg-muted p-2 rounded text-xs overflow-x-auto mt-1">{schemaString}</pre>
      </div>
    </div>
  )
}
