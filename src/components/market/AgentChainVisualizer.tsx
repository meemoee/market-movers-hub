import { useMemo } from 'react'
import { ChainConfig, Agent } from '@/utils/executeAgentChain'
import ReactFlow, { Background, Controls, Edge, MarkerType, Node, Position } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

interface AgentChainVisualizerProps {
  chain: ChainConfig
  agents: Agent[]
}

// Helper to get truncated agent label
function getAgentLabel(agentId: string, agents: Agent[]) {
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) return 'Unknown'
  const prompt = agent.prompt || ''
  return prompt.length > 20 ? `${prompt.slice(0, 20)}...` : prompt
}

export default function AgentChainVisualizer({ chain, agents }: AgentChainVisualizerProps) {
  if (!chain || !chain.layers?.length) return null

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []

    chain.layers.forEach((layer, layerIdx) => {
      layer.agents.forEach((block, idx) => {
        const id = `L${layerIdx}A${idx}`
        const label = getAgentLabel(block.agentId, agents)
        nodes.push({
          id,
          data: { label },
          position: { x: idx * 200, y: layerIdx * 150 },
          style: {
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: 6,
            background: 'var(--card)',
          },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        })

        if (block.routes) {
          block.routes.forEach((targetIdx, rIdx) => {
            const targetId = `L${layerIdx + 1}A${targetIdx}`
            const fields = block.fieldRoutes?.[rIdx]?.join(', ')
            edges.push({
              id: `${id}-${targetId}-${rIdx}`,
              source: id,
              target: targetId,
              markerEnd: { type: MarkerType.ArrowClosed },
              label: fields,
            })
          })
        }
      })
    })

    return { nodes, edges }
  }, [chain, agents])

  return (
    <div style={{ width: '100%', height: 400 }}>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}

