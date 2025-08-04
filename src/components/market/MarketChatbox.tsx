import { BookmarkPlus, MessageCircle, Send, Settings, GitBranchPlus, GitBranch } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { supabase } from "@/integrations/supabase/client"
import ReactMarkdown from 'react-markdown'
import { Card } from "@/components/ui/card"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import AgentChainDialog from './AgentChainDialog'
import { executeAgentChain, ChainConfig } from "@/utils/executeAgentChain"

interface MarketChatboxProps {
  marketId: string
  marketQuestion: string
  marketDescription?: string
}

interface Message {
  type: 'user' | 'assistant'
  content?: string
  reasoning?: string
}

interface OpenRouterModel {
  id: string
  name: string
  description?: string
}

interface Agent {
  id: string
  prompt: string
  model: string
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
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [selectedModel, setSelectedModel] = useState('perplexity/sonar')
  const [availableModels, setAvailableModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false)
  const [isChainDialogOpen, setIsChainDialogOpen] = useState(false)
  const [editingChain, setEditingChain] = useState<AgentChain | null>(null)
  const [newAgentPrompt, setNewAgentPrompt] = useState('')
  const [newAgentModel, setNewAgentModel] = useState('perplexity/sonar')
  const [chains, setChains] = useState<AgentChain[]>([])
  const [selectedChain, setSelectedChain] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamingContentRef = useRef<HTMLDivElement>(null)
  const { user } = useCurrentUser()

  // DOM-based streaming content update with flushSync for immediate display
  const updateStreamingContent = useCallback((content: string, isComplete: boolean = false) => {
    if (streamingContentRef.current) {
      if (isComplete) {
        // Final update: clear DOM content and let React take over
        streamingContentRef.current.innerHTML = ''
        setStreamingContent(content)
        setIsStreaming(false)
      } else {
        // Live update: Force immediate DOM manipulation with flushSync and paint forcing
        flushSync(() => {
          const cursor = '<span class="inline-block w-2 h-4 bg-primary ml-1 animate-pulse">|</span>'
          streamingContentRef.current!.innerHTML = `<div class="text-sm whitespace-pre-wrap">${content}${cursor}</div>`
        })
        
        // Force browser paint cycle
          requestAnimationFrame(() => {
            // Force layout/reflow to ensure immediate visual update
            if (streamingContentRef.current) {
              void streamingContentRef.current.offsetHeight
            }
          })
      }
    }
  }, [])

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
          { id: 'perplexity/sonar', name: 'Perplexity Sonar', description: 'Fast and accurate' },
          { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'OpenAI fast model' },
          { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', description: 'Anthropic fast model' }
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
        .select('id, prompt, model')
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
      handleChatMessage(agent.prompt)
    }
  }

  const handleSelectChain = (chainId: string) => {
    setSelectedChain(chainId)
    // Immediately execute the chain to mimic regular agent behavior
    handleChatMessage('', chainId)
  }

  const handleEditChain = () => {
    const chain = chains.find(c => c.id === selectedChain)
    if (chain) {
      setEditingChain(chain)
      setIsChainDialogOpen(true)
    }
  }

  const renderChainSummary = () => {
    const chain = chains.find(c => c.id === selectedChain)
    if (!chain) return null
    const getAgentLabel = (id: string) => agents.find(a => a.id === id)?.prompt.slice(0, 20) || 'Unknown'
    return (
      <div className="mt-2 text-xs text-muted-foreground space-y-1">
        {chain.config.layers.map((layer, idx) => (
          <div key={idx}>
            <span className="font-medium">Layer {idx + 1}:</span>{' '}
            {layer.agents.map(a => getAgentLabel(a.agentId)).join(', ')}
          </div>
        ))}
      </div>
    )
  }

  const saveAgent = async () => {
    if (!newAgentPrompt.trim() || !user?.id) return
    const { data, error } = await supabase
      .from('agents')
      .insert({ user_id: user.id, prompt: newAgentPrompt, model: newAgentModel })
      .select()
      .single()
    if (error) {
      console.error('Failed to save agent:', error)
      return
    }
    if (data) {
      setAgents(prev => [data, ...prev])
      setSelectedAgent(data.id)
      setSelectedModel(data.model)
      handleChatMessage(data.prompt)
    }
    setIsAgentDialogOpen(false)
    setNewAgentPrompt('')
    setNewAgentModel(selectedModel)
  }

  // Chat functionality using Web Worker
  const handleChatMessage = async (userMessage: string, chainId?: string) => {
    const activeChainId = chainId || selectedChain
    if ((!userMessage.trim() && !activeChainId) || isLoading) return
    
    // TEST MODE: If message starts with "test", run test chunks
    if (userMessage.toLowerCase().startsWith('test')) {
      setHasStartedChat(true)
      setIsLoading(true)
      setMessages(prev => [...prev, { type: 'user', content: userMessage }])
      setChatMessage('')
      
      console.log('🧪 [CHAT] Starting TEST MODE with custom chunks')
      
      const worker = new Worker('/streaming-worker.js')
      
      worker.onmessage = (e) => {
        const { type, data } = e.data
        console.log('📨 [MAIN] Received worker message:', type, data)
        
          switch (type) {
            case 'CONTENT_CHUNK': {
              console.log('📝 [MAIN] Processing content chunk:', data.newChunk)
              console.log('📝 [MAIN] Total accumulated:', data.content)
              updateStreamingContent(data.content)
              break
            }

            case 'STREAM_COMPLETE': {
              console.log('✅ [MAIN] Test sequence completed')
              updateStreamingContent(data.content, true)

              const finalMessage: Message = {
                type: 'assistant',
                content: data.content,
                reasoning: data.reasoning
              }
              setMessages(prev => [...prev, finalMessage])
              setIsLoading(false)
              setIsStreaming(false)
              setStreamingContent('')
              worker.terminate()
              break
            }
          }
      }
      
      setIsStreaming(true)
      
      worker.postMessage({
        type: 'TEST_CHUNKS',
        data: {}
      })
      
      return
    }
    
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
      let finalAgentId: string | undefined

      if (activeChainId) {
        const chain = chains.find(c => c.id === activeChainId)
        if (!chain) {
          throw new Error('Selected chain not found')
        }
        const result = await executeAgentChain(
          chain.config,
          agents,
          userMessage,
          {
            userId: user?.id,
            marketId,
            marketQuestion,
            marketDescription,
            authToken
          }
        )

        finalAgentId = chain.config.layers.at(-1)?.agents[0]?.agentId

        if (result.outputs && result.outputs.length > 0) {
          const finalLayerIndex = chain.config.layers.length
          // Filter out outputs from the final layer rather than by agent ID
          // so intermediate results are preserved even if agent IDs repeat
          const chainMessages = result.outputs
            .filter(o => o.layer !== finalLayerIndex)
            .map(o => ({
              type: 'assistant' as const,
              content: `Agent ${o.agentId}: ${o.output}`
            }))
          if (chainMessages.length > 0) {
            setMessages(prev => [...prev, ...chainMessages])
          }
        }
        finalPrompt = result.prompt
        finalModel = result.model
      }

      console.log('📤 [CHAT] Starting web worker for streaming')

      const worker = new Worker('/streaming-worker.js')

      worker.onmessage = (e) => {
        const { type, data } = e.data

        switch (type) {
          case 'CONTENT_CHUNK': {
            console.log('📝 [WORKER-MSG] Received content chunk')
            updateStreamingContent(data.content)
            break
          }

          case 'REASONING_CHUNK': {
            console.log('🧠 [WORKER-MSG] Received reasoning chunk')
            setStreamingReasoning(data.reasoning)
            break
          }

          case 'STREAM_COMPLETE': {
            console.log('✅ [WORKER-MSG] Stream completed')
            updateStreamingContent(data.content, true)

            const finalMessage: Message = {
              type: 'assistant',
              content: finalAgentId ? `Agent ${finalAgentId}: ${data.content}` : data.content,
              reasoning: data.reasoning
            }
            setMessages(prev => [...prev, finalMessage])
            setIsLoading(false)
            setIsStreaming(false)
            setStreamingContent('')
            setStreamingReasoning('')
            worker.terminate()
            break
          }

          case 'ERROR': {
            console.error('🚨 [WORKER-MSG] Error:', data.error)
            const errorMessage: Message = {
              type: 'assistant',
              content: `Sorry, I encountered an error: ${data.error}`
            }
            setMessages(prev => [...prev, errorMessage])
            setIsLoading(false)
            setIsStreaming(false)
            setStreamingContent('')
            setStreamingReasoning('')
            worker.terminate()
            break
          }
        }
      }

      worker.onerror = (error) => {
        console.error('🚨 [WORKER] Worker error:', error)
        setIsLoading(false)
        setIsStreaming(false)
        setStreamingContent('')
        setStreamingReasoning('')
      }

      const baseHistory = messages.map(m => ({ role: m.type, content: m.content }))
      const marketContextMessage = {
        role: 'assistant' as const,
        content: `Current Market Context:\n- Market Question: ${marketQuestion || 'Not specified'}\n- Market Description: ${marketDescription ? marketDescription.substring(0, 300) + '...' : 'Not specified'}\n- Market ID: ${marketId || 'Not specified'}`
      }
      const chatHistoryWithContext = baseHistory.length === 0 ? [marketContextMessage] : baseHistory

      worker.postMessage({
        type: 'START_STREAM',
        data: {
          url: "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/market-chat",
          options: {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: finalPrompt,
              chatHistory: chatHistoryWithContext,
              userId: user?.id,
              marketId,
              marketQuestion,
              marketDescription,
              selectedModel: finalModel
            })
          }
        }
      })

      setIsStreaming(true)

    } catch (error) {
      console.error('🚨 [CHAT] Error setting up worker:', error)
      const err = error as Error
      const errorMessage: Message = {
        type: 'assistant',
        content: `Sorry, I encountered an error: ${err.message}`
      }
      setMessages(prev => [...prev, errorMessage])
      setIsLoading(false)
      setIsStreaming(false)
      setStreamingContent('')
      setStreamingReasoning('')
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
              <div className="bg-muted/50 p-3 rounded-lg">
                {message.type === 'user' ? (
                  <p className="text-sm font-medium">{message.content}</p>
                ) : (
                  <ReactMarkdown className="text-sm prose prose-sm max-w-none [&>*]:text-foreground">
                    {message.content || ''}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          ))}
          {(streamingReasoning || streamingContent || isStreaming) && (
            <div className="space-y-2">
              {streamingReasoning && (
                <div className="bg-yellow-100/50 border-l-4 border-yellow-400 p-3 rounded-lg">
                  <p className="text-xs font-medium text-yellow-800 mb-1">REASONING:</p>
                  <ReactMarkdown className="text-xs prose prose-sm max-w-none text-yellow-700">
                    {streamingReasoning}
                  </ReactMarkdown>
                </div>
              )}
              {(streamingContent || isStreaming) && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  {/* DOM-based streaming content or React-based final content */}
                  {isStreaming ? (
                    <div ref={streamingContentRef} className="min-h-[1rem]" />
                  ) : (
                    <ReactMarkdown className="text-sm prose prose-sm max-w-none [&>*]:text-foreground">
                      {streamingContent}
                    </ReactMarkdown>
                  )}
                </div>
              )}
            </div>
          )}
          {isLoading && !streamingContent && !streamingReasoning && (
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm text-muted-foreground">Thinking...</p>
            </div>
          )}
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
        {selectedChain && renderChainSummary()}
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
            {availableModels.map((model) => (
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
          <div className="space-y-4">
            <Textarea
              value={newAgentPrompt}
              onChange={(e) => setNewAgentPrompt(e.target.value)}
              placeholder="Enter agent prompt"
              className="h-24"
            />
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">Model:</span>
              <Select value={newAgentModel} onValueChange={setNewAgentModel} disabled={modelsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={modelsLoading ? 'Loading...' : 'Select model'} />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
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