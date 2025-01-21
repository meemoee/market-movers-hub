import { useState, useCallback, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { 
  ReactFlow, 
  Background, 
  Controls,
  Connection, 
  useNodesState, 
  useEdgesState, 
  addEdge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { QANodeComponent } from './nodes/QANodeComponent';
import { supabase } from '@/integrations/supabase/client';

interface QAResponse {
  question: string;
  answer: string;
}

export function MarketQATree({ marketId }: { marketId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
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

  useState(() => {
    if (nodes.length === 0) {
      // Create root node
      const rootNode = {
        id: 'node-1',
        type: 'qaNode',
        position: { x: 0, y: 0 },
        data: {
          question: 'Loading...',
          answer: '',
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
          
          let accumulatedContent = '';
          
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
                          accumulatedContent += content;
                          
                          try {
                            // Try to parse the accumulated content as JSON
                            const qaContent: QAResponse = JSON.parse(accumulatedContent);
                            console.log('Parsed QA content:', qaContent);
                            
                            if (qaContent.question) {
                              updateNodeData('node-1', 'question', qaContent.question);
                            }
                            if (qaContent.answer) {
                              updateNodeData('node-1', 'answer', qaContent.answer);
                            }
                          } catch (e) {
                            // If we can't parse as JSON yet, continue accumulating
                            console.log('Accumulated content not yet valid JSON:', accumulatedContent);
                          }
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
  });

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