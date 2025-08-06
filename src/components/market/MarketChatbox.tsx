import { BookmarkPlus, MessageCircle, Send, Settings, GitBranchPlus, GitBranch, Loader2, Play } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from "@/integrations/supabase/client"
import ReactMarkdown from 'react-markdown'
import { Card } from "@/components/ui/card"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { JsonSchemaEditor, DEFAULT_JSON_SCHEMA } from "@/components/ui/json-schema-editor"
import { ScrollArea } from "@/components/ui/scroll-area"
import AgentChainDialog from './AgentChainDialog'
import AgentChainVisualizer from './AgentChainVisualizer'
import { executeAgentChain, ChainConfig, AgentOutput } from "@/utils/executeAgentChain"

interface MarketChatboxProps {
  marketId: string
  marketQuestion: string
  marketDescription?: string
}

interface Message {
  type: 'user' | 'assistant'
  content?: string
  reasoning?: string
  agentId?: string
  layer?: number
  isTyping?: boolean
  jsonMode?: boolean
}

interface OpenRouterModel {
  id: string
  name: string
  description?: string
  supports_response_format?: boolean
}

interface Agent {
  id: string
  prompt: string
  model: string
  json_mode?: boolean
  json_schema?: unknown
}

interface AgentChain {
  id: string
  name: string
  config: ChainConfig
}

export function MarketChatbox({ marketId, marketQuestion, marketDescription }: MarketChatboxProps) {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState('perplexity/sonar')
  const [availableModels, setAvailableModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false)
  const [isChainDialogOpen, setIsChainDialogOpen] = useState(false)
  const [editingChain, setEditingChain] = useState<AgentChain | null>(null)
  const [newAgentPrompt, setNewAgentPrompt] = useState('')
  const [newAgentModel, setNewAgentModel] = useState('perplexity/sonar')
  const [newAgentJsonMode, setNewAgentJsonMode] = useState(false)
  const [newAgentJsonSchema, setNewAgentJsonSchema] = useState('')
  const [chains, setChains] = useState<AgentChain[]>([])
  const [selectedChain, setSelectedChain] = useState('')
  const { user } = useCurrentUser()

  const layerStyles = [
    { border: 'border-blue-500', text: 'text-blue-500' },
    { border: 'border-green-500', text: 'text-green-500' },
    { border: 'border-purple-500', text: 'text-purple-500' },
    { border: 'border-pink-500', text: 'text-pink-500' }
  ] as const

  const formatKey = (key: string) =>
    key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())

  const renderJsonContent = (content?: string) => {
    if (!content) return null
    try {
      const data = JSON.parse(content)
      if (typeof data === 'object' && data !== null) {
        return Object.entries(data).map(([key, value]) => (
          <p key={key}>
            <span className="font-medium">{formatKey(key)}:</span>{' '}
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </p>
        ))
      }
    } catch {
      return <pre className="text-sm">{content}</pre>
    }
    return null
  }

  // Fetch available models on component mount
  useEffect(() => {
    const fetchModels = async () => {
      setModelsLoading(true)
      try {
        const { data, error } = await supabase.functions.invoke('get-openrouter-models', {
          body: { userId: user?.id }
        })
        if (error) throw error
        
        console.log('Fetched models from API:', data.models?.length || 0)
        setAvailableModels(data.models || [])
      } catch (error) {
        console.error('Failed to fetch OpenRouter models:', error)
        // Set fallback models if API fails
        setAvailableModels([
          { id: 'perplexity/sonar', name: 'Perplexity Sonar', description: 'Fast and accurate', supports_response_format: true },
          { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'OpenAI fast model', supports_response_format: true },
          { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', description: 'Anthropic fast model', supports_response_format: true }
        ])
      } finally {
        setModelsLoading(false)
      }
    }

    fetchModels()
  }, [user?.id])

  useEffect(() => {
    const fetchAgents = async () => {
      if (!user?.id) return
      const { data, error } = await supabase
        .from('agents')
        .select('id, prompt, model, json_mode, json_schema')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to fetch agents:', error)
        return
      }
      setAgents(data || [])
    }

    fetchAgents()
  }, [user?.id])

  const fetchChains = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await supabase
      .from('agent_chains')
      .select('id, name, config')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Failed to fetch agent chains:', error)
      return
    }
    setChains(data || [])
  }, [user?.id])

  useEffect(() => {
    fetchChains()
  }, [fetchChains])


  const handleSelectAgent = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId)
    if (agent) {
      setSelectedAgent(agentId)
      setSelectedModel(agent.model)
      handleChatMessage(agent.prompt, undefined, agent.id)
    }
  }

  const handleSelectChain = (chainId: string) => {
    setSelectedChain(chainId)
  }

  const handleEditChain = () => {
    const chain = chains.find(c => c.id === selectedChain)
    if (chain) {
      setEditingChain(chain)
      setIsChainDialogOpen(true)
    }
  }

  const selectedChainObj = chains.find(c => c.id === selectedChain)
  const selectedAgentObj = agents.find(a => a.id === selectedAgent)

  useEffect(() => {
    if (selectedAgentObj?.json_mode) {
      const jsonModels = availableModels.filter(m => m.supports_response_format)
      if (!jsonModels.some(m => m.id === selectedModel)) {
        setSelectedModel(jsonModels[0]?.id || '')
      }
    }
    }, [selectedAgentObj, availableModels, selectedModel])

  useEffect(() => {
    const models = newAgentJsonMode
      ? availableModels.filter(m => m.supports_response_format)
      : availableModels
    if (!models.some(m => m.id === newAgentModel)) {
      setNewAgentModel(models[0]?.id || '')
    }
    }, [newAgentJsonMode, availableModels, newAgentModel])

  useEffect(() => {
    if (newAgentJsonMode && !newAgentJsonSchema.trim()) {
      setNewAgentJsonSchema(DEFAULT_JSON_SCHEMA)
    }
  }, [newAgentJsonMode, newAgentJsonSchema])

  const saveAgent = async () => {
    if (!newAgentPrompt.trim() || !user?.id) return
    let schemaObj = null
    if (newAgentJsonMode && newAgentJsonSchema.trim()) {
      try {
        schemaObj = JSON.parse(newAgentJsonSchema)
      } catch (e) {
        console.error('Invalid JSON schema:', e)
      }
    }
    const { data, error } = await supabase
      .from('agents')
      .insert({
        user_id: user.id,
        prompt: newAgentPrompt,
        model: newAgentModel,
        json_mode: newAgentJsonMode,
        json_schema: schemaObj
      })
      .select()
      .single()
    if (error) {
      console.error('Failed to save agent:', error)
      return
    }
    if (data) {
      const updatedAgents = [data, ...agents]
      setAgents(updatedAgents)
      setSelectedAgent(data.id)
      setSelectedModel(data.model)
      handleChatMessage(data.prompt, undefined, data.id, updatedAgents)
    }
    setIsAgentDialogOpen(false)
    setNewAgentPrompt('')
    setNewAgentModel(selectedModel)
    setNewAgentJsonMode(false)
    setNewAgentJsonSchema('')
  }

  // Chat functionality using Web Worker
  const handleChatMessage = async (
    userMessage: string,
    chainId?: string,
    agentId?: string,
    agentsOverride?: Agent[]
  ) => {
    const activeChainId = chainId
    const currentAgents = agentsOverride || agents
    if ((!userMessage.trim() && !activeChainId) || isLoading) return

    setHasStartedChat(true)
    setIsLoading(true)
    if (userMessage.trim()) {
      setMessages(prev => [...prev, { type: 'user', content: userMessage }])
    } else if (activeChainId) {
      const chain = chains.find(c => c.id === activeChainId)
      setMessages(prev => [...prev, { type: 'user', content: `Running chain: ${chain?.name || ''}`.trim() }])
    }
    setChatMessage('')

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const authToken = sessionData.session?.access_token
      if (!authToken) {
        throw new Error("No authentication token available")
      }

      let finalPrompt = userMessage
      let finalModel = selectedModel
      let finalAgentId: string | undefined = agentId
      let finalLayerIndex: number | undefined
      let finalJsonMode: boolean | undefined
        let finalJsonSchema: unknown

      const handleAgentOutput = (output: AgentOutput) => {
        const agent = currentAgents.find(a => a.id === output.agentId)
        const isJson = agent?.json_mode
        setMessages(prev => {
          const index = prev.findIndex(
            m => m.agentId === output.agentId && m.layer === output.layer && m.isTyping
          )
          if (index !== -1) {
            const newMessages = [...prev]
            newMessages[index] = { ...newMessages[index], content: output.output, isTyping: false, jsonMode: isJson }
            return newMessages
          }
          return [...prev, { type: 'assistant', content: output.output, agentId: output.agentId, layer: output.layer, jsonMode: isJson }]
        })
      }

      const handleAgentStart = ({ layer, agentId }: { layer: number; agentId: string }) => {
        const agent = currentAgents.find(a => a.id === agentId)
        setMessages(prev => [...prev, { type: 'assistant', agentId, layer, isTyping: true, jsonMode: agent?.json_mode }])
      }

      if (activeChainId) {
        const chain = chains.find(c => c.id === activeChainId)
        if (!chain) {
          throw new Error('Selected chain not found')
        }
        finalLayerIndex = chain.config.layers.length - 1
        chain.config.layers.forEach((layer, layerIdx) => {
          layer.agents.forEach((block, agentIdx) => {
            const isFinalAgent = layerIdx === chain.config.layers.length - 1 && agentIdx === 0
            if (isFinalAgent) {
              finalAgentId = block.agentId
            }
          })
        })
        const result = await executeAgentChain(
          chain.config,
          currentAgents,
          userMessage,
          {
            userId: user?.id,
            marketId,
            marketQuestion,
            marketDescription,
            authToken
          },
          handleAgentOutput,
          handleAgentStart
        )
        finalPrompt = result.prompt
        finalModel = result.model
        finalJsonMode = result.json_mode
        finalJsonSchema = result.json_schema
      }

      const baseHistory = messages
        .filter(m => typeof m.content === 'string' && m.content.length > 0)
        .map(m => ({ role: m.type, content: m.content! }))

      // Always include market context while removing empty messages
      const marketContextMessage = {
        role: 'assistant' as const,
        content: `Current Market Context:\n- Market Question: ${marketQuestion || 'Not specified'}\n- Market Description: ${marketDescription ? marketDescription.substring(0, 300) + '...' : 'Not specified'}\n- Market ID: ${marketId || 'Not specified'}`
      }

      const chatHistoryWithContext = [marketContextMessage, ...baseHistory]

      const finalPlaceholder: Message = {
        type: 'assistant',
        agentId: finalAgentId,
        layer: finalLayerIndex,
        isTyping: true,
        jsonMode: finalJsonMode
      }
      setMessages(prev => [...prev, finalPlaceholder])

      if (!finalJsonMode && finalAgentId) {
        const agent = currentAgents.find(a => a.id === finalAgentId)
        finalJsonMode = agent?.json_mode
        finalJsonSchema = agent?.json_schema
      }

      const { data, error } = await supabase.functions.invoke('market-chat', {
        body: {
          message: finalPrompt,
          chatHistory: chatHistoryWithContext,
          userId: user?.id,
          marketId,
          marketQuestion,
          marketDescription,
          selectedModel: finalModel,
          jsonMode: finalJsonMode,
          jsonSchema: finalJsonSchema
        }
      })

      if (error) throw error

      setMessages(prev => {
        const index = prev.findIndex(
          m => m.agentId === finalAgentId && m.layer === finalLayerIndex && m.isTyping
        )
        const newMessages = [...prev]
        const updated: Message = {
          type: 'assistant',
          content: data.content,
          reasoning: data.reasoning,
          agentId: finalAgentId,
          layer: finalLayerIndex,
          jsonMode: finalJsonMode
        }
        if (index !== -1) {
          newMessages[index] = updated
          return newMessages
        }
        return [...newMessages, updated]
      })
    } catch (error) {
      console.error('🚨 [CHAT] Error:', error)
      const err = error as Error
      const errorMessage: Message = {
        type: 'assistant',
        content: `Sorry, I encountered an error: ${err.message}`
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Card className="p-6 bg-card">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Market Chat</h3>
        </div>
      
      {!hasStartedChat ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">
            Ask questions about this market or get AI insights on factors that might influence the outcome.
          </p>
          <p className="text-sm text-muted-foreground">
            Market: {marketQuestion}
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto">
          {messages.map((message, index) => (
            <div key={index} className="space-y-2">
              {message.reasoning && (
                <div className="bg-yellow-100/50 border-l-4 border-yellow-400 p-3 rounded-lg">
                  <p className="text-xs font-medium text-yellow-800 mb-1">REASONING:</p>
                  <ReactMarkdown className="text-xs prose prose-sm max-w-none text-yellow-700">
                    {message.reasoning}
                  </ReactMarkdown>
                </div>
              )}
              {(() => {
                const style = message.layer !== undefined
                  ? layerStyles[message.layer % layerStyles.length]
                  : { border: 'border-muted', text: 'text-muted-foreground' }
                return (
                  <div
                    className={`p-3 rounded-lg ${
                      message.type === 'user'
                        ? 'bg-primary/10 border-l-4 border-primary text-primary'
                        : `bg-card border-l-4 ${style.border} text-foreground`
                    }`}
                  >
                    {message.agentId !== undefined && message.layer !== undefined && (
                      <p className={`text-xs font-medium mb-1 flex items-center ${style.text}`}>
                        <GitBranch className="w-3 h-3 mr-1" />
                        Layer {message.layer + 1} · Agent {message.agentId}
                      </p>
                    )}
                    {message.isTyping ? (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        <span>Thinking...</span>
                      </div>
                    ) : message.type === 'user' ? (
                      <p className="text-sm font-medium">{message.content}</p>
                    ) : message.jsonMode ? (
                      <div className="text-sm space-y-1">
                        {renderJsonContent(message.content)}
                      </div>
                    ) : (
                      <ReactMarkdown className="text-sm prose prose-sm max-w-none [&>*]:text-foreground">
                        {message.content || ''}
                      </ReactMarkdown>
                    )}
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Saved Agent:</span>
          {agents.length > 0 && (
            <Select value={selectedAgent} onValueChange={handleSelectAgent} disabled={isLoading}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id} className="text-xs">
                    {agent.prompt.slice(0, 30)}...
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            className="p-2 hover:bg-accent rounded-lg transition-colors text-primary"
            onClick={() => setIsAgentDialogOpen(true)}
            disabled={isLoading}
          >
            <BookmarkPlus size={16} />
          </button>
          <span className="text-sm text-muted-foreground">Saved Chain:</span>
          {chains.length > 0 && (
            <Select value={selectedChain} onValueChange={handleSelectChain} disabled={isLoading}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Select chain" />
              </SelectTrigger>
              <SelectContent>
                {chains.map((chain) => (
                  <SelectItem key={chain.id} value={chain.id} className="text-xs">
                    {chain.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            className="p-2 hover:bg-accent rounded-lg transition-colors text-primary"
            onClick={() => { setEditingChain(null); setIsChainDialogOpen(true) }}
            disabled={isLoading}
          >
            <GitBranchPlus size={16} />
          </button>
          {selectedChain && (
            <button
              className="p-2 hover:bg-accent rounded-lg transition-colors text-primary"
              onClick={handleEditChain}
              disabled={isLoading}
            >
              <GitBranch size={16} />
            </button>
          )}
        </div>
        {selectedChainObj && (
          <AgentChainVisualizer chain={selectedChainObj.config} agents={agents} />
        )}
      </div>

      {/* Model Selection */}
      <div className="mb-4 flex items-center gap-2">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Model:</span>
        <Select value={selectedModel} onValueChange={setSelectedModel} disabled={modelsLoading || isLoading}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder={modelsLoading ? "Loading..." : "Select model"} />
          </SelectTrigger>
          <SelectContent>
            {(selectedAgentObj?.json_mode
              ? availableModels.filter(m => m.supports_response_format)
              : availableModels
            ).map((model) => (
              <SelectItem key={model.id} value={model.id} className="text-xs">
                <div>
                  <div className="font-medium">{model.name}</div>
                  {model.description && (
                    <div className="text-muted-foreground text-xs">{model.description}</div>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleChatMessage(chatMessage)
            }
          }}
          placeholder="Ask about this market..."
          className="flex-grow p-2 bg-background border border-border rounded-lg text-sm"
        />
        <button
          className="p-2 hover:bg-accent rounded-lg transition-colors text-primary disabled:opacity-50"
          onClick={() => {
            if (selectedChain) {
              handleChatMessage('', selectedChain)
            }
          }}
          disabled={isLoading || !selectedChain}
        >
          <Play size={16} />
        </button>
        <button
          className="p-2 hover:bg-accent rounded-lg transition-colors text-primary"
          onClick={() => handleChatMessage(chatMessage)}
          disabled={isLoading}
        >
          <Send size={16} />
        </button>
      </div>
      </Card>
      <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Agent</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              <Textarea
                value={newAgentPrompt}
                onChange={(e) => setNewAgentPrompt(e.target.value)}
                placeholder="Enter agent prompt"
                className="h-24"
              />
              <div className="flex items-center space-x-2">
                <Switch id="json-mode" checked={newAgentJsonMode} onCheckedChange={setNewAgentJsonMode} />
                <Label htmlFor="json-mode" className="text-sm">Enable JSON mode</Label>
              </div>
              {newAgentJsonMode && (
                <JsonSchemaEditor
                  value={newAgentJsonSchema}
                  onChange={setNewAgentJsonSchema}
                />
              )}
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">Model:</span>
                <Select value={newAgentModel} onValueChange={setNewAgentModel} disabled={modelsLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder={modelsLoading ? 'Loading...' : 'Select model'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(newAgentJsonMode ? availableModels.filter(m => m.supports_response_format) : availableModels).map((model) => (
                      <SelectItem key={model.id} value={model.id} className="text-xs">
                        <div>
                          <div className="font-medium">{model.name}</div>
                          {model.description && (
                            <div className="text-muted-foreground text-xs">{model.description}</div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsAgentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAgent} disabled={!newAgentPrompt.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AgentChainDialog
        open={isChainDialogOpen}
        onOpenChange={(open) => {
          setIsChainDialogOpen(open)
          if (!open) setEditingChain(null)
        }}
        agents={agents}
        onSaved={fetchChains}
        chain={editingChain || undefined}
      />
    </>
  )
}