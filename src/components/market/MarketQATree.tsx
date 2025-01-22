import { Handle, Position } from '@xyflow/react';
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useCallback } from 'react';
import { ReactFlow, Background, Controls, Connection, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card } from "@/components/ui/card";
import { QANodeComponent } from './nodes/QANodeComponent';
import { supabase } from '@/integrations/supabase/client';
import { generateNodePosition } from './utils/nodeGenerator';

export function MarketQATree({ marketId }: { marketId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
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

  const updateNodeData = useCallback((nodeId: string, field: string, value: string | string[]) => {
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

  const addChildNode = useCallback((parentId: string) => {
    const parentNode = nodes.find(node => node.id === parentId);
    if (!parentNode) return;

    const newNodeId = `node-${nodes.length + 1}`;
    const position = generateNodePosition(
      nodes.length,
      1,
      parentNode.position.x,
      parentNode.position.y,
      1,
      3
    );

    const newNode = {
      id: newNodeId,
      type: 'qaNode',
      position,
      data: {
        question: '',
        answer: '',
        subQuestions: [],
        updateNodeData,
        addChildNode,
        removeNode: handleRemoveNode,
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [
      ...eds,
      {
        id: `edge-${parentId}-${newNodeId}`,
        source: parentId,
        target: newNodeId,
        type: 'smoothstep',
      },
    ]);
  }, [nodes, setNodes, setEdges]);

  const handleRemoveNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
  }, [setNodes, setEdges]);

  const processStreamChunk = useCallback((chunk: string) => {
    contentBufferRef.current += chunk;
    
    try {
      // Try to parse complete JSON objects from the buffer
      const jsonMatch = contentBufferRef.current.match(/\{.*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        
        if (parsed.question) {
          updateNodeData('node-1', 'question', parsed.question);
        }
        if (parsed.answer) {
          updateNodeData('node-1', 'answer', parsed.answer);
        }
        if (parsed.subQuestions && Array.isArray(parsed.subQuestions)) {
          updateNodeData('node-1', 'subQuestions', parsed.subQuestions);
        }
        
        // Clear the processed JSON from the buffer
        contentBufferRef.current = contentBufferRef.current.slice(jsonMatch.index! + jsonStr.length);
      }
    } catch (e) {
      // If JSON parsing fails, it might be an incomplete chunk
      console.log('Incomplete JSON chunk, waiting for more data');
    }
  }, [updateNodeData]);

  useEffect(() => {
    if (nodes.length === 0) {
      const rootNode = {
        id: 'node-1',
        type: 'qaNode',
        position: { x: 0, y: 0 },
        data: {
          question: 'Loading...',
          answer: '',
          subQuestions: [],
          updateNodeData,
          addChildNode,
          removeNode: handleRemoveNode,
        }
      };
      setNodes([rootNode]);

      const streamResponse = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
          abortControllerRef.current = new AbortController();

          console.log('Sending request to generate-qa-tree function...');
          const { data, error } = await supabase.functions.invoke('generate-qa-tree', {
            body: { marketId, userId: user.id }
          });

          if (error) throw error;

          console.log('Received response from generate-qa-tree:', data);
          
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
                  console.log('Received chunk:', chunk);
                  
                  const lines = chunk.split('\n').filter(line => line.trim());
                  console.log('Processing lines:', lines);
                  
                  for (const line of lines) {
                    if (line.startsWith('data: ')) {
                      const jsonStr = line.slice(6).trim();
                      console.log('Processing JSON string:', jsonStr);
                      
                      if (jsonStr === '[DONE]') continue;
                      
                      try {
                        const parsed = JSON.parse(jsonStr);
                        console.log('Parsed JSON:', parsed);
                        
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) {
                          console.log('New content chunk:', content);
                          processStreamChunk(content);
                        }
                      } catch (e) {
                        console.error('Error parsing SSE data:', e, 'Raw data:', jsonStr);
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
          console.error('Error streaming response:', error);
          updateNodeData('node-1', 'answer', 'Error generating response');
        } finally {
          abortControllerRef.current = null;
        }
      };

      streamResponse();
    }
  }, [nodes.length, marketId, setNodes, processStreamChunk, updateNodeData, addChildNode, handleRemoveNode]);

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