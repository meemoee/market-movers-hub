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
    <div className="mt-4 space-y-3 text-xs">
      {chain.layers.map((layer, layerIdx) => {
        const isLast = layerIdx === chain.layers.length - 1
        return (
          <div key={layerIdx} className="relative pl-8">
            {!isLast && <span className="absolute left-2 top-5 bottom-0 w-px bg-border" />}
            <span className="absolute left-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
              {layerIdx + 1}
            </span>
            <div className="flex flex-wrap gap-2">
              {layer.agents.map((block, idx) => {
                const agent = agents.find(a => a.id === block.agentId)
                const label = getAgentLabel(block.agentId, agents)
                return (
                  <div key={idx} className="px-2 py-1 rounded-md border bg-card text-card-foreground">
                    <div className="truncate font-medium" title={agent?.prompt || ''}>
                      {label}
                    </div>
                    {block.copies && block.copies > 1 && (
                      <div className="text-[10px] text-muted-foreground">×{block.copies}</div>
                    )}
                    {block.routes && block.routes.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                        <ArrowRight className="w-3 h-3" />
                        {block.routes.map(r => {
                          const targetBlock = chain.layers[layerIdx + 1]?.agents[r]
                          const targetLabel = targetBlock
                            ? getAgentLabel(targetBlock.agentId, agents)
                            : `Layer ${layerIdx + 2} Agent ${r + 1}`
                          const fields = block.fieldRoutes?.[r]
                          return (
                            <span key={r} className="px-1 py-0.5 rounded bg-muted">
                              {targetLabel}
                              {fields && fields.length > 0 && ` (${fields.join(', ')})`}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

