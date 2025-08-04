import { useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"

interface Agent {
  id: string
  prompt: string
  model: string
}

interface AgentBlock {
  id: string
  agentId: string
  prompt: string
  copies: number
}

interface Layer {
  id: string
  agents: AgentBlock[]
  advancedRouting: boolean
  routing: Record<string, string[]>
}

export interface AgentChain {
  name: string
  layers: Layer[]
}

interface AgentChainBuilderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agents: Agent[]
  onSave: (chain: AgentChain) => void
}

const generateId = () => Math.random().toString(36).slice(2)

export function AgentChainBuilder({ open, onOpenChange, agents, onSave }: AgentChainBuilderProps) {
  const [chainName, setChainName] = useState("")
  const [layers, setLayers] = useState<Layer[]>([])

  const addLayer = () => {
    setLayers(prev => [...prev, { id: generateId(), agents: [], advancedRouting: false, routing: {} }])
  }

  const removeLayer = (index: number) => {
    setLayers(prev => prev.filter((_, i) => i !== index))
  }

  const addAgent = (layerIndex: number) => {
    setLayers(prev => {
      const newLayers = [...prev]
      const layer = newLayers[layerIndex]
      layer.agents.push({ id: generateId(), agentId: "", prompt: "", copies: 1 })
      return newLayers
    })
  }

  const removeAgent = (layerIndex: number, agentId: string) => {
    setLayers(prev => {
      const newLayers = [...prev]
      newLayers[layerIndex].agents = newLayers[layerIndex].agents.filter(a => a.id !== agentId)
      return newLayers
    })
  }

  const updateAgent = (layerIndex: number, agentId: string, updates: Partial<AgentBlock>) => {
    setLayers(prev => {
      const newLayers = [...prev]
      const layer = newLayers[layerIndex]
      layer.agents = layer.agents.map(a => (a.id === agentId ? { ...a, ...updates } : a))
      return newLayers
    })
  }

  const toggleAdvanced = (layerIndex: number, value: boolean) => {
    setLayers(prev => {
      const newLayers = [...prev]
      newLayers[layerIndex].advancedRouting = value
      return newLayers
    })
  }

  const updateRouting = (layerIndex: number, fromId: string, toId: string, checked: boolean) => {
    setLayers(prev => {
      const newLayers = [...prev]
      const layer = newLayers[layerIndex]
      const current = layer.routing[fromId] || []
      if (checked) {
        layer.routing[fromId] = Array.from(new Set([...current, toId]))
      } else {
        layer.routing[fromId] = current.filter(id => id !== toId)
      }
      return newLayers
    })
  }

  const reset = () => {
    setChainName("")
    setLayers([])
  }

  const handleSave = () => {
    onSave({ name: chainName, layers })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Agent Chain</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Chain name"
            value={chainName}
            onChange={e => setChainName(e.target.value)}
          />
          {layers.map((layer, layerIndex) => {
            const nextLayer = layers[layerIndex + 1]
            const inputLabel =
              layerIndex === 0
                ? "User input"
                : `Output from layer ${layerIndex}`
            return (
              <div key={layer.id} className="border rounded-md p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-sm">Layer {layerIndex + 1}</h4>
                    <p className="text-xs text-muted-foreground">{inputLabel}</p>
                  </div>
                  {layers.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeLayer(layerIndex)}>
                      Remove
                    </Button>
                  )}
                </div>
                {layer.agents.map(agent => (
                  <div key={agent.id} className="border rounded-md p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Select
                        value={agent.agentId}
                        onValueChange={v => updateAgent(layerIndex, agent.id, { agentId: v })}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Select agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map(a => (
                            <SelectItem key={a.id} value={a.id} className="text-xs">
                              {a.prompt.slice(0, 30)}...
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        value={agent.copies}
                        onChange={e =>
                          updateAgent(layerIndex, agent.id, { copies: parseInt(e.target.value) || 1 })
                        }
                        className="w-20"
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeAgent(layerIndex, agent.id)}>
                        Remove
                      </Button>
                    </div>
                    <Textarea
                      value={agent.prompt}
                      onChange={e => updateAgent(layerIndex, agent.id, { prompt: e.target.value })}
                      placeholder="Custom prompt"
                      className="h-20"
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addAgent(layerIndex)}>
                  Add agent
                </Button>
                {nextLayer && (
                  <div className="pt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={layer.advancedRouting}
                        onCheckedChange={v => toggleAdvanced(layerIndex, v)}
                      />
                      <span className="text-sm">Advanced routing</span>
                    </div>
                    {layer.advancedRouting && (
                      <div className="space-y-2">
                        {layer.agents.map(a => (
                          <div key={a.id} className="space-y-1">
                            <div className="text-xs text-muted-foreground">
                              Route {a.agentId ? agents.find(ag => ag.id === a.agentId)?.prompt.slice(0, 20) : 'agent'} to:
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {nextLayer.agents.map(next => (
                                <label key={next.id} className="flex items-center gap-1 text-xs">
                                  <Checkbox
                                    checked={layer.routing[a.id]?.includes(next.id) || false}
                                    onCheckedChange={checked =>
                                      updateRouting(layerIndex, a.id, next.id, Boolean(checked))
                                    }
                                  />
                                  {next.agentId ? agents.find(ag => ag.id === next.agentId)?.prompt.slice(0, 20) : 'agent'}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <Button variant="outline" onClick={addLayer}>
            Add layer
          </Button>
          {layers.length > 0 && (
            <div className="p-2 bg-muted/50 rounded-md text-xs space-y-1">
              {layers.map((layer, i) => (
                <div key={layer.id}>
                  Layer {i + 1}: {layer.agents.length} agent(s)
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => { reset(); onOpenChange(false) }}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!chainName || layers.length === 0}>
            Save chain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AgentChainBuilder

