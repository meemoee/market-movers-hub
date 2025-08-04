import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Trash2, Plus } from 'lucide-react'
import { supabase } from "@/integrations/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"

interface Agent {
  id: string
  prompt: string
  model: string
}

interface AgentBlock {
  agentId: string
  prompt: string
  copies: number
  routes?: number[]
}

interface Layer {
  agents: AgentBlock[]
}

interface AgentChainDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agents: Agent[]
}

export function AgentChainDialog({ open, onOpenChange, agents }: AgentChainDialogProps) {
  const { user } = useCurrentUser()
  const [chainName, setChainName] = useState('')
  const [layers, setLayers] = useState<Layer[]>([
    { agents: [{ agentId: '', prompt: '', copies: 1 }] }
  ])
  const [advancedRouting, setAdvancedRouting] = useState<Record<number, boolean>>({})

  const addLayer = () => {
    setLayers(prev => [...prev, { agents: [] }])
  }

  const removeLayer = (layerIndex: number) => {
    setLayers(prev => prev.filter((_, i) => i !== layerIndex))
  }

  const addAgentToLayer = (layerIndex: number) => {
    setLayers(prev => prev.map((layer, i) => i === layerIndex ? {
      ...layer,
      agents: [...layer.agents, { agentId: '', prompt: '', copies: 1 }]
    } : layer))
  }

  const removeAgentFromLayer = (layerIndex: number, agentIndex: number) => {
    setLayers(prev => prev.map((layer, i) => i === layerIndex ? {
      ...layer,
      agents: layer.agents.filter((_, j) => j !== agentIndex)
    } : layer))
  }

  const updateAgentBlock = (layerIndex: number, agentIndex: number, field: keyof AgentBlock, value: string | number) => {
    setLayers(prev => prev.map((layer, i) => i === layerIndex ? {
      ...layer,
      agents: layer.agents.map((agent, j) => j === agentIndex ? {
        ...agent,
        [field]: value
      } : agent)
    } : layer))
  }

  const handleRoutingChange = (layerIndex: number, agentIndex: number, targetIndex: number) => {
    setLayers(prev => prev.map((layer, i) => {
      if (i !== layerIndex) return layer
      const current = layer.agents[agentIndex].routes || []
      const exists = current.includes(targetIndex)
      const routes = exists ? current.filter(r => r !== targetIndex) : [...current, targetIndex]
      return {
        ...layer,
        agents: layer.agents.map((agent, j) => j === agentIndex ? { ...agent, routes } : agent)
      }
    }))
  }

  const reset = () => {
    setChainName('')
    setLayers([{ agents: [{ agentId: '', prompt: '', copies: 1 }] }])
    setAdvancedRouting({})
  }

  const saveChain = async () => {
    if (!user?.id || !chainName.trim()) return
    const config = { layers }
    const { error } = await supabase.from('agent_chains').insert({
      user_id: user.id,
      name: chainName,
      config
    })
    if (error) {
      console.error('Failed to save agent chain:', error)
      return
    }
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Agent Chain</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Input
            placeholder="Chain name"
            value={chainName}
            onChange={(e) => setChainName(e.target.value)}
          />

          {layers.map((layer, layerIndex) => (
            <Card key={layerIndex} className="p-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Layer {layerIndex + 1}</span>
                {layers.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeLayer(layerIndex)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {layer.agents.map((agent, agentIndex) => (
                <div key={agentIndex} className="border p-3 rounded-md space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={agent.agentId}
                      onValueChange={(val) => updateAgentBlock(layerIndex, agentIndex, 'agentId', val)}
                    >
                      <SelectTrigger className="w-[200px]">
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
                      onChange={(e) => updateAgentBlock(layerIndex, agentIndex, 'copies', parseInt(e.target.value))}
                      className="w-16"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAgentFromLayer(layerIndex, agentIndex)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Custom prompt (optional)"
                    value={agent.prompt}
                    onChange={(e) => updateAgentBlock(layerIndex, agentIndex, 'prompt', e.target.value)}
                  />
                </div>
              ))}

              <Button variant="secondary" size="sm" onClick={() => addAgentToLayer(layerIndex)}>
                <Plus className="w-4 h-4 mr-1" /> Add agent
              </Button>

              {layerIndex < layers.length - 1 && layers[layerIndex + 1].agents.length > 0 && (
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 mb-2">
                    <Switch
                      id={`advanced-${layerIndex}`}
                      checked={advancedRouting[layerIndex] || false}
                      onCheckedChange={(checked) => setAdvancedRouting(prev => ({ ...prev, [layerIndex]: checked }))}
                    />
                    <Label htmlFor={`advanced-${layerIndex}`} className="text-xs">Advanced routing</Label>
                  </div>
                  {advancedRouting[layerIndex] && (
                    <div className="space-y-2">
                      {layer.agents.map((_, agentIdx) => (
                        <div key={agentIdx} className="flex flex-wrap items-center gap-2 text-xs">
                          <span>Agent {agentIdx + 1} to:</span>
                          {layers[layerIndex + 1].agents.map((_, targetIdx) => (
                            <label key={targetIdx} className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={layers[layerIndex].agents[agentIdx].routes?.includes(targetIdx) || false}
                                onChange={() => handleRoutingChange(layerIndex, agentIdx, targetIdx)}
                                className="h-3 w-3"
                              />
                              Agent {targetIdx + 1}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}

          <Button variant="outline" onClick={addLayer} className="w-full">
            <Plus className="w-4 h-4 mr-2" /> Add layer
          </Button>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => { reset(); onOpenChange(false) }}>
            Cancel
          </Button>
          <Button onClick={saveChain} disabled={!chainName.trim()}>
            Save chain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AgentChainDialog

