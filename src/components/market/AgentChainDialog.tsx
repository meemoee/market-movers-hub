import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { Trash2, Plus } from 'lucide-react'
import { supabase } from "@/integrations/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { ChainConfig, Agent } from "@/utils/executeAgentChain"

interface AgentBlock {
  agentId: string
  prompt: string
  copies: number
  routes: number[]
  fieldRoutes?: Record<number, string[]>
}

interface Layer {
  agents: AgentBlock[]
}

interface AgentChainDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agents: Agent[]
  onSaved?: () => void
  chain?: { id: string; name: string; config: ChainConfig }
}

const initialLayer: Layer = { agents: [{ agentId: '', prompt: '', copies: 1, routes: [], fieldRoutes: {} }] }

export function AgentChainDialog({ open, onOpenChange, agents, onSaved, chain }: AgentChainDialogProps) {
  const { user } = useCurrentUser()
  const [chainName, setChainName] = useState('')
  const [layers, setLayers] = useState<Layer[]>([initialLayer])

  const addLayer = () => {
    setLayers(prev => [...prev, { agents: [] }])
  }

  const removeLayer = (layerIndex: number) => {
    setLayers(prev => prev.filter((_, i) => i !== layerIndex))
  }

  const addAgentToLayer = (layerIndex: number) => {
    setLayers(prev => prev.map((layer, i) => i === layerIndex ? {
      ...layer,
      agents: [...layer.agents, { agentId: '', prompt: '', copies: 1, routes: [], fieldRoutes: {} }]
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
      return {
        ...layer,
        agents: layer.agents.map((agent, j) => {
          if (j !== agentIndex) return agent
          const current = agent.routes || []
          const exists = current.includes(targetIndex)
          const routes = exists ? current.filter(r => r !== targetIndex) : [...current, targetIndex]
          const fieldRoutes = { ...(agent.fieldRoutes || {}) }
          if (exists) {
            delete fieldRoutes[targetIndex]
          }
          return { ...agent, routes, fieldRoutes }
        })
      }
    }))
  }

  const handleFieldRouteChange = (
    layerIndex: number,
    agentIndex: number,
    targetIndex: number,
    field: string,
    checked: boolean
  ) => {
    setLayers(prev => prev.map((layer, i) => {
      if (i !== layerIndex) return layer
      return {
        ...layer,
        agents: layer.agents.map((agent, j) => {
          if (j !== agentIndex) return agent
          const current = agent.fieldRoutes?.[targetIndex] || []
          const fields = checked ? [...current, field] : current.filter(f => f !== field)
          return {
            ...agent,
            fieldRoutes: { ...(agent.fieldRoutes || {}), [targetIndex]: fields }
          }
        })
      }
    }))
  }

  const getIncomingAgents = (layerIndex: number, agentIndex: number) => {
    if (layerIndex === 0) return []
    return layers[layerIndex - 1].agents
      .map((agent, idx) => agent.routes?.includes(agentIndex) ? idx + 1 : null)
      .filter((idx): idx is number => idx !== null)
  }

  const getSchemaFields = (agentId: string): string[] => {
    const agentObj = agents.find(a => a.id === agentId)
    if (agentObj?.json_mode && agentObj.json_schema) {
      try {
        const schema =
          typeof agentObj.json_schema === 'string'
            ? JSON.parse(agentObj.json_schema)
            : agentObj.json_schema
        return Object.keys(
          // json_schema follows the structure { schema: { properties: { ... } } }
          (schema as { schema?: { properties?: Record<string, unknown> } })?.schema?.properties || {}
        )
      } catch {
        return []
      }
    }
    return []
  }

  const reset = () => {
    setChainName('')
    setLayers([initialLayer])
  }

  useEffect(() => {
    if (open) {
      if (chain) {
        setChainName(chain.name)
        setLayers(
          chain.config.layers.map(l => ({
            agents: l.agents.map(a => ({ ...a, routes: a.routes || [], fieldRoutes: a.fieldRoutes || {} }))
          })) as Layer[]
        )
      } else {
        reset()
      }
    }
  }, [open, chain])

  const saveChain = async () => {
    if (!user?.id || !chainName.trim()) return
    for (let i = 0; i < layers.length - 1; i++) {
      for (const block of layers[i].agents) {
        if (!block.routes || block.routes.length === 0) {
          alert('All agents must route to at least one agent in the next layer')
          return
        }
      }
    }
    const config: ChainConfig = { layers }
    let error
    if (chain) {
      const { error: updateError } = await supabase
        .from('agent_chains')
        .update({ name: chainName, config })
        .eq('id', chain.id)
      error = updateError
    } else {
      const { error: insertError } = await supabase.from('agent_chains').insert({
        user_id: user.id,
        name: chainName,
        config
      })
      error = insertError
    }
    if (error) {
      console.error('Failed to save agent chain:', error)
      return
    }
    reset()
    onOpenChange(false)
    onSaved?.()
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

              {layer.agents.map((agent, agentIndex) => {
                const incoming = getIncomingAgents(layerIndex, agentIndex)
                const schemaFields = getSchemaFields(agent.agentId)
                return (
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
                    {incoming.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Receives output from agent(s): {incoming.join(', ')}
                      </div>
                    )}
                    <Textarea
                      placeholder="Custom prompt (optional)"
                      value={agent.prompt}
                      onChange={(e) => updateAgentBlock(layerIndex, agentIndex, 'prompt', e.target.value)}
                    />
                    {schemaFields.length > 0 && (
                      <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                        {schemaFields.map(field => (
                          <span key={field} className="rounded bg-muted px-1 py-0.5">
                            {field}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              <Button variant="secondary" size="sm" onClick={() => addAgentToLayer(layerIndex)}>
                <Plus className="w-4 h-4 mr-1" /> Add agent
              </Button>

              {layerIndex < layers.length - 1 && layers[layerIndex + 1].agents.length > 0 && (
                <div className="pt-4 border-t space-y-2">
                  {layer.agents.map((block, agentIdx) => {
                    const schemaFields = getSchemaFields(block.agentId)
                    return (
                      <div key={agentIdx} className="flex flex-wrap items-start gap-2 text-xs">
                        <span>Agent {agentIdx + 1} to:</span>
                        {layers[layerIndex + 1].agents.map((_, targetIdx) => {
                          const isChecked = layers[layerIndex].agents[agentIdx].routes?.includes(targetIdx) || false
                          return (
                            <div key={targetIdx} className="flex flex-col gap-1">
                              <label className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleRoutingChange(layerIndex, agentIdx, targetIdx)}
                                  className="h-3 w-3"
                                />
                                Agent {targetIdx + 1}
                              </label>
                              {schemaFields.length > 0 && (
                                <div className="ml-4 flex flex-wrap gap-1">
                                  {schemaFields.map(field => (
                                    <label key={field} className="flex items-center gap-1">
                                      <input
                                        type="checkbox"
                                        checked={layers[layerIndex].agents[agentIdx].fieldRoutes?.[targetIdx]?.includes(field) || false}
                                        onChange={(e) => handleFieldRouteChange(layerIndex, agentIdx, targetIdx, field, e.target.checked)}
                                        className="h-3 w-3"
                                        disabled={!isChecked}
                                      />
                                      {field}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
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

