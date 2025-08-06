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
    <div className="mt-4 space-y-4 text-xs">
      {chain.layers.map((layer, layerIdx) => (
        <div key={layerIdx} className="flex items-stretch gap-3">
          {/* Layer indicator */}
          <div className="flex flex-col items-center w-6">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
              {layerIdx + 1}
            </div>
            {layerIdx < chain.layers.length - 1 && (
              <div className="w-px flex-1 bg-border" />
            )}
          </div>

          {/* Agents within layer */}
          <div className="flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {layer.agents.map((block, idx) => {
                const agent = agents.find(a => a.id === block.agentId)
                const label = getAgentLabel(block.agentId, agents)
                return (
                  <div key={idx} className="p-2 rounded-md border bg-card text-card-foreground">
                    <div className="font-medium truncate" title={agent?.prompt || ''}>
                      {label}
                    </div>
                    {block.copies && block.copies > 1 && (
                      <div className="text-[10px] text-muted-foreground">×{block.copies}</div>
                    )}
                    {block.routes && block.routes.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                        <ArrowRight className="w-3 h-3" />
                        {block.routes.map(r => (
                          <span key={r} className="px-1 py-0.5 rounded bg-muted">
                            {`L${layerIdx + 2}A${r + 1}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

