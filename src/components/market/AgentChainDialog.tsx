import { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { supabase } from '@/integrations/supabase/client'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  Connection,
  Edge,
  Node,
  useEdgesState,
  useNodesState
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

interface Agent {
  id: string
  prompt: string
  model: string
}

interface AgentNodeData {
  agentId: string
  prompt: string
}

interface AgentChainDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agents: Agent[]
  userId?: string
}

export function AgentChainDialog({ open, onOpenChange, agents, userId }: AgentChainDialogProps) {
  const [chainName, setChainName] = useState('')
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AgentNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  )

  const addAgentNode = () => {
    const id = (nodes.length + 1).toString()
    setNodes((nds) => nds.concat({
      id,
      type: 'agentNode',
      position: { x: 100 * nds.length, y: 0 },
      data: { agentId: agents[0]?.id || '', prompt: '' }
    }))
  }

  const saveChain = async () => {
    if (!userId) return
    await supabase.from('agent_chains').insert({
      user_id: userId,
      name: chainName || 'Untitled Chain',
      chain: { nodes, edges }
    })
    setChainName('')
    setNodes([])
    setEdges([])
    onOpenChange(false)
  }

  const AgentNode = ({ id, data }: { id: string; data: AgentNodeData }) => (
    <div className="bg-background border rounded-md p-2 w-48 text-xs space-y-2">
      <Select
        value={data.agentId}
        onValueChange={(val) =>
          setNodes((nds) =>
            nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, agentId: val } } : n))
          )
        }
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Agent" />
        </SelectTrigger>
        <SelectContent>
          {agents.map((a) => (
            <SelectItem key={a.id} value={a.id} className="text-xs">
              {a.prompt.slice(0, 30)}...
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        value={data.prompt}
        onChange={(e) =>
          setNodes((nds) =>
            nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, prompt: e.target.value } } : n))
          )
        }
        placeholder="Custom prompt"
        className="h-20"
      />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Create Agent Chain</DialogTitle>
        </DialogHeader>
        <div className="h-[400px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={{ agentNode: AgentNode }}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        <div className="mt-4 space-y-2">
          <Input
            value={chainName}
            onChange={(e) => setChainName(e.target.value)}
            placeholder="Chain name"
          />
          <Button variant="secondary" onClick={addAgentNode} className="w-fit">
            Add Agent
          </Button>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={saveChain} disabled={nodes.length === 0}>
            Save Chain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AgentChainDialog
