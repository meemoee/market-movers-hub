import { ArrowRight } from 'lucide-react'
import { ChainConfig, Agent } from '@/utils/executeAgentChain'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const COLORS = [
  { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' },
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
  { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-200' },
  { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-200' },
]

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

  const agentColors: Record<string, number> = {}
  let colorIndex = 0
  const lastLayerIdx = chain.layers.length - 1

  chain.layers[lastLayerIdx].agents.forEach((_, idx) => {
    agentColors[`${lastLayerIdx}-${idx}`] = colorIndex % COLORS.length
    colorIndex++
  })

  for (let layerIdx = lastLayerIdx - 1; layerIdx >= 0; layerIdx--) {
    const layer = chain.layers[layerIdx]
    layer.agents.forEach((block, agentIdx) => {
      block.routes?.forEach(r => {
        const targetColor = agentColors[`${layerIdx + 1}-${r}`]
        if (targetColor === undefined) return
        const fields = block.fieldRoutes?.[r] || []
        if (fields.length === 0 || (block.routes && block.routes.length === 1)) {
          agentColors[`${layerIdx}-${agentIdx}`] = targetColor
        }
      })
    })
  }

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
                const colorIdx = agentColors[`${layerIdx}-${idx}`]
                const color = colorIdx !== undefined ? COLORS[colorIdx] : null
                return (
                  <div
                    key={idx}
                    className={cn(
                      'px-2 py-1 rounded-md border',
                      color ? `${color.bg} ${color.text} ${color.border}` : 'bg-card text-card-foreground'
                    )}
                  >
                    <div className="truncate font-medium" title={agent?.prompt || ''}>
                      {label}
                    </div>
                    {block.copies && block.copies > 1 && (
                      <div className="text-[10px] text-muted-foreground">×{block.copies}</div>
                    )}
                    {block.routes && block.routes.length > 0 && (
                      <div className="mt-1 flex flex-col gap-1">
                        {block.routes.map(r => {
                          const targetBlock = chain.layers[layerIdx + 1]?.agents[r]
                          const targetLabel = targetBlock
                            ? getAgentLabel(targetBlock.agentId, agents)
                            : `Layer ${layerIdx + 2} Agent ${r + 1}`
                          const fields = block.fieldRoutes?.[r] || []
                          const tColorIdx = agentColors[`${layerIdx + 1}-${r}`]
                          const tColor = tColorIdx !== undefined ? COLORS[tColorIdx] : null
                          return (
                            <div key={r} className="flex items-center gap-1 text-[10px]">
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <Badge
                                variant="outline"
                                className={cn('text-[10px]', tColor && `${tColor.bg} ${tColor.text} ${tColor.border}`)}
                              >
                                {targetLabel}
                              </Badge>
                              {fields.map(f => (
                                <Badge
                                  key={f}
                                  variant="outline"
                                  className={cn('text-[10px]', tColor && `${tColor.bg} ${tColor.text} ${tColor.border}`)}
                                >
                                  {f}
                                </Badge>
                              ))}
                            </div>
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

