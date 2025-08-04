import { useCallback, useMemo } from 'react'
import { ReactFlow, Background, Controls, addEdge, useEdgesState, useNodesState, Connection, Edge, Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface Agent {
  id: string
  prompt: string
  model: string
}

interface AgentChainDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  savedAgents: Agent[]
  onSave: (chain: AgentChain) => void
}

interface AgentNodeData {
  agentId: string
  prompt: string
  agents: Agent[]
  onChangeAgent: (nodeId: string, agentId: string) => void
  onChangePrompt: (nodeId: string, prompt: string) => void
}

interface AgentChain {
  nodes: Node<AgentNodeData>[]
  edges: Edge[]
}

const AgentNode = ({ id, data }: NodeProps<AgentNodeData>) => {
  return (
    <div className="bg-card border rounded-md p-2 w-56">
      <Select value={data.agentId} onValueChange={(value) => data.onChangeAgent(id, value)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select agent" />
        </SelectTrigger>
        <SelectContent>
          {data.agents.map((agent) => (
            <SelectItem key={agent.id} value={agent.id} className="text-xs">
              {agent.prompt.slice(0, 20)}...
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        value={data.prompt}
        onChange={(e) => data.onChangePrompt(id, e.target.value)}
        placeholder="Custom prompt"
        className="mt-2 h-16"
      />
    </div>
  )
}

export function AgentChainDialog({ open, onOpenChange, savedAgents, onSave }: AgentChainDialogProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const handleAgentChange = useCallback((nodeId: string, agentId: string) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, agentId } } : n)))
  }, [setNodes])

  const handlePromptChange = useCallback((nodeId: string, prompt: string) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, prompt } } : n)))
  }, [setNodes])

  const createNodeData = useCallback((id: string): AgentNodeData => ({
    agentId: '',
    prompt: '',
    agents: savedAgents,
    onChangeAgent: handleAgentChange,
    onChangePrompt: handlePromptChange,
  }), [savedAgents, handleAgentChange, handlePromptChange])

  const addAgentNode = () => {
    setNodes((nds) => {
      const id = (nds.length + 1).toString()
      const newNode: Node<AgentNodeData> = {
        id,
        position: { x: 0, y: nds.length * 80 },
        data: createNodeData(id),
        type: 'agentNode',
      }
      return nds.concat(newNode)
    })
  }

  const onConnect = useCallback((connection: Connection) => setEdges((eds) => addEdge(connection, eds)), [setEdges])

  const nodeTypes = useMemo(() => ({ agentNode: AgentNode }), [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Agent Chain</DialogTitle>
        </DialogHeader>
        <div className="h-[400px] border rounded-md mb-4">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        <DialogFooter>
          <div className="flex flex-1 justify-between">
            <Button variant="secondary" onClick={addAgentNode}>Add Agent</Button>
            <Button onClick={() => onSave({ nodes, edges })}>Save Chain</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type { AgentChain }
