import { useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
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

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []

    chain.layers.forEach((layer, layerIdx) => {
      layer.agents.forEach((block, idx) => {
        const id = `${layerIdx}-${idx}`
        const label = getAgentLabel(block.agentId, agents)
        nodes.push({
          id,
          data: { label },
          position: { x: layerIdx * 200, y: idx * 120 },
        })

        block.routes?.forEach((targetIdx, rIdx) => {
          const targetId = `${layerIdx + 1}-${targetIdx}`
          const fields = block.fieldRoutes?.[rIdx]?.join(', ')
          edges.push({
            id: `${id}-${targetId}-${rIdx}`,
            source: id,
            target: targetId,
            label: fields,
            markerEnd: { type: MarkerType.ArrowClosed },
          })
        })
      })
    })

    return { nodes, edges }
  }, [chain, agents])

  return (
    <div className="mt-4 h-64">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}

