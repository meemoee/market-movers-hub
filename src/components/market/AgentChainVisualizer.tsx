import { useEffect, useRef, useState } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const agentRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [lines, setLines] = useState<
    { x1: number; y1: number; x2: number; y2: number; fields: string[] }
  >([])

  useEffect(() => {
    const newLines: { x1: number; y1: number; x2: number; y2: number; fields: string[] }[] = []
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!containerRect) return

    chain.layers.forEach((layer, layerIdx) => {
      layer.agents.forEach((block, blockIdx) => {
        const sourceKey = `${layerIdx}-${blockIdx}`
        const sourceRect = agentRefs.current[sourceKey]?.getBoundingClientRect()
        if (!sourceRect) return

        block.routes?.forEach((targetIdx, routeIdx) => {
          const targetKey = `${layerIdx + 1}-${targetIdx}`
          const targetRect = agentRefs.current[targetKey]?.getBoundingClientRect()
          if (!targetRect) return

          newLines.push({
            x1: sourceRect.left + sourceRect.width / 2 - containerRect.left,
            y1: sourceRect.bottom - containerRect.top,
            x2: targetRect.left + targetRect.width / 2 - containerRect.left,
            y2: targetRect.top - containerRect.top,
            fields: block.fieldRoutes?.[routeIdx] || []
          })
        })
      })
    })

    setLines(newLines)
  }, [chain])

  if (!chain || !chain.layers?.length) return null

  return (
    <div ref={containerRef} className="relative mt-4 text-xs">
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <marker
            id="arrow"
            markerWidth="6"
            markerHeight="6"
            refX="3"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L6,3 L0,6 z" className="fill-border" />
          </marker>
        </defs>
        {lines.map((line, idx) => (
          <g key={idx}>
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="hsl(var(--border))"
              strokeWidth={1}
              markerEnd="url(#arrow)"
            />
            {line.fields.length > 0 && (
              <text
                x={(line.x1 + line.x2) / 2}
                y={(line.y1 + line.y2) / 2 - 2}
                className="fill-current text-[8px]"
                textAnchor="middle"
              >
                {line.fields.join(', ')}
              </text>
            )}
          </g>
        ))}
      </svg>
      {chain.layers.map((layer, layerIdx) => (
        <div key={layerIdx} className="mb-4 flex justify-center gap-4">
          {layer.agents.map((block, idx) => {
            const key = `${layerIdx}-${idx}`
            const agent = agents.find(a => a.id === block.agentId)
            const label = getAgentLabel(block.agentId, agents)
            return (
              <div
                key={idx}
                ref={el => {
                  agentRefs.current[key] = el
                }}
                className="min-w-[120px] rounded-md border bg-card px-2 py-1 text-card-foreground"
              >
                <div className="truncate font-medium" title={agent?.prompt || ''}>
                  {label}
                </div>
                {block.copies && block.copies > 1 && (
                  <div className="text-[10px] text-muted-foreground">×{block.copies}</div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

