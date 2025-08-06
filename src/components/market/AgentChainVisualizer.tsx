import { ArrowRight } from 'lucide-react'
import { ChainConfig, Agent } from '@/utils/executeAgentChain'

interface AgentChainVisualizerProps {
  chain: ChainConfig
  agents: Agent[]
}

// Helper to get truncated agent label
function getAgentLabel(agentId: string, agents: Agent[]) {
  const agent = agents.find(a => a.id === agentId)
  if (!agent) return 'Unknown'
  const prompt = agent.prompt || ''
  return prompt.length > 20 ? `${prompt.slice(0, 20)}...` : prompt
}

export default function AgentChainVisualizer({ chain, agents }: AgentChainVisualizerProps) {
  if (!chain || !chain.layers?.length) return null

  return (
    <div className="mt-4 space-y-6">
      {chain.layers.map((layer, layerIdx) => (
        <div key={layerIdx} className="flex items-start gap-4">
          {/* Layer indicator */}
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
              {layerIdx + 1}
            </div>
            {layerIdx < chain.layers.length - 1 && (
              <div className="w-px flex-1 bg-muted" />
            )}
          </div>

          {/* Agents within layer */}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              {layer.agents.map((block, idx) => (
                <div key={idx} className="relative p-2 rounded-md bg-secondary text-secondary-foreground text-xs border">
                  <div className="font-medium">
                    {getAgentLabel(block.agentId, agents)}
                  </div>
                  {block.copies && block.copies > 1 && (
                    <div className="text-[10px] text-muted-foreground">×{block.copies}</div>
                  )}
                  {block.routes && block.routes.length > 0 && (
                    <div className="mt-1 text-[10px] text-muted-foreground flex items-center">
                      <ArrowRight className="w-3 h-3 mr-1" />
                      {block.routes
                        .map(r => `L${layerIdx + 2}A${r + 1}`)
                        .join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

