import { Handle, Position, Node } from '@xyflow/react';
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useCallback, useState } from 'react';
import { ReactFlow, Background, Controls, Connection, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card } from "@/components/ui/card";
import { QANodeComponent } from './nodes/QANodeComponent';
import { supabase } from '@/integrations/supabase/client';
import { generateNodePosition } from './utils/nodeGenerator';

interface QAData {
  question: string;
  answer: string;
  updateNodeData: (id: string, field: string, value: string) => void;
  addChildNode: (id: string) => void;
  removeNode: (id: string) => void;
  depth: number;
}

type QANode = Node<QAData>;

export function MarketQATree({ marketId }: { marketId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<QANode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [maxDepth] = useState(2); // Maximum depth of 2 for the tree
  const abortControllerRef = useRef<AbortController | null>(null);
  const contentBufferRef = useRef('');

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        setEdges((eds) => addEdge(params, eds));
      }
    },
    [setEdges]
  );

  const updateNodeData = useCallback((nodeId: string, field: string, value: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              [field]: value,
            },
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  const handleRemoveNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
  }, [setNodes, setEdges]);

  const processStreamChunk = useCallback((chunk: string, nodeId: string) => {
    contentBufferRef.current += chunk;
    
    try {
      const jsonMatch = contentBufferRef.current.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (parsed.answer) {
          updateNodeData(nodeId, 'answer', parsed.answer);
        }
        
        if (parsed.questions && Array.isArray(parsed.questions) && parsed.questions.length === 3) {
          const node = nodes.find(n => n.id === nodeId);
          if (node && node.data.depth < maxDepth) {
            parsed.questions.forEach((question: string, index: number) => {
              const newNodeId = `${nodeId}-${index + 1}`;
              const position = generateNodePosition(
                index,
                3,
                node.position.x,
                node.position.y,
                node.data.depth + 1,
                maxDepth
              );

              const newNode: QANode = {
                id: newNodeId,
                type: 'qaNode',
                position,
                data: {
                  question,
                  answer: 'Analyzing...',
                  updateNodeData,
                  addChildNode: () => {}, // Disabled for leaf nodes
                  removeNode: handleRemoveNode,
                  depth: node.data.depth + 1
                },
              };

              setNodes((nds) => [...nds, newNode]);

              setEdges((eds) => [...eds, {
                id: `edge-${nodeId}-${newNodeId}`,
                source: nodeId,
                target: newNodeId,
                type: 'smoothstep',
              }]);

              // Generate answer for the new node if not at max depth
              if (node.data.depth + 1 < maxDepth) {
                generateAnswer(newNodeId, question);
              }
            });
          }
        }
      }
    } catch (e) {
      console.error('Error parsing stream chunk:', e);
    }
  }, [nodes, setNodes, setEdges, updateNodeData, handleRemoveNode, maxDepth]);

  const generateAnswer = useCallback(async (nodeId: string, question: string) => {
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('Generating answer for node:', nodeId, 'Question:', question);
      const { data, error } = await supabase.functions.invoke('generate-qa-tree', {
        body: { 
          marketId, 
          userId: user.id,
          question
        }
      });

      if (error) throw error;

      const stream = new ReadableStream({
        start(controller) {
          const textDecoder = new TextDecoder();
          const reader = new Response(data.body).body?.getReader();
          
          function push() {
            reader?.read().then(({done, value}) => {
              if (done) {
                console.log('Stream complete');
                controller.close();
                return;
              }
              
              const chunk = textDecoder.decode(value);
              const lines = chunk.split('\n').filter(line => line.trim());
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim();
                  if (jsonStr === '[DONE]') continue;
                  
                  try {
                    const parsed = JSON.parse(jsonStr);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                      processStreamChunk(content, nodeId);
                    }
                  } catch (e) {
                    console.error('Error parsing SSE data:', e);
                  }
                }
              }
              
              push();
            });
          }
          
          push();
        }
      });

      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

    } catch (error) {
      console.error('Error generating answer:', error);
      updateNodeData(nodeId, 'answer', 'Error generating response');
    } finally {
      abortControllerRef.current = null;
    }
  }, [marketId, processStreamChunk, updateNodeData]);

  useEffect(() => {
    if (nodes.length === 0) {
      const initializeTree = async () => {
        try {
          const { data: market, error: marketError } = await supabase
            .from('markets')
            .select('question')
            .eq('id', marketId)
            .single();

          if (marketError) throw marketError;
          if (!market) throw new Error('Market not found');

          const rootNode: QANode = {
            id: 'node-1',
            type: 'qaNode',
            position: { x: 0, y: 0 },
            data: {
              question: market.question,
              answer: 'Analyzing...',
              updateNodeData,
              addChildNode: () => {}, // Root node doesn't need this
              removeNode: handleRemoveNode,
              depth: 0
            }
          };
          setNodes([rootNode]);
          
          // Generate answer for root node
          generateAnswer('node-1', market.question);
        } catch (error) {
          console.error('Error initializing tree:', error);
        }
      };

      initializeTree();
    }
  }, [nodes.length, marketId, setNodes, updateNodeData, handleRemoveNode, generateAnswer]);

  const nodeTypes = {
    qaNode: QANodeComponent
  };

  return (
    <Card className="p-4 mt-4 bg-card h-[600px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
      >
        <Background />
        <Controls className="!bg-transparent [&>button]:!bg-transparent" />
      </ReactFlow>
    </Card>
  );
}