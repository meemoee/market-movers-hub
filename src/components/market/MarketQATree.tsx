import { Handle, Position } from '@xyflow/react';
import { useEffect, useRef, useCallback, useState } from 'react';
import { ReactFlow, Background, Controls, Connection, useNodesState, useEdgesState, addEdge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card } from "@/components/ui/card";
import { QANodeComponent } from './nodes/QANodeComponent';
import { supabase } from '@/integrations/supabase/client';
import { generateNodePosition } from './utils/nodeGenerator';

interface QAData extends Record<string, unknown> {
  question: string;
  answer: string;
  updateNodeData: (id: string, field: string, value: string) => void;
  addChildNode: (id: string) => void;
  removeNode: (id: string) => void;
  depth: number;
}

type QANode = Node<QAData>;

export function MarketQATree({ marketId }: { marketId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<QAData>>([]);
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
      const lines = contentBufferRef.current.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(jsonStr);
            console.log('Parsed streaming chunk:', parsed);
            
            if (parsed.content) {
              const content = parsed.content;
              
              const answerMatch = content.match(/ANSWER:\s*([\s\S]*?)(?=QUESTIONS:|$)/i);
              const questionsMatch = content.match(/QUESTIONS:\s*([\s\S]*?)$/i);
              
              if (answerMatch) {
                const answer = answerMatch[1].trim();
                console.log('Extracted answer:', answer);
                updateNodeData(nodeId, 'answer', answer);
              }
              
              if (questionsMatch) {
                const questionsText = questionsMatch[1];
                console.log('Questions text:', questionsText);
                
                const questions = questionsText
                  .split(/\d+\.\s+/)
                  .filter(q => q.trim())
                  .slice(0, 3);
                
                console.log('Extracted questions:', questions);
                
                if (questions.length > 0) {
                  const node = nodes.find(n => n.id === nodeId);
                  if (node && node.data.depth < maxDepth) {
                    questions.forEach((question, index) => {
                      const newNodeId = `${nodeId}-${index + 1}`;
                      const position = generateNodePosition(
                        index,
                        3,
                        node.position.x,
                        node.position.y,
                        node.data.depth + 1,
                        maxDepth
                      );

                      const newNode: Node<QAData> = {
                        id: newNodeId,
                        type: 'qaNode',
                        position,
                        data: {
                          question: question.trim(),
                          answer: 'Analyzing...',
                          updateNodeData,
                          addChildNode: handleAddChildNode,
                          removeNode: handleRemoveNode,
                          depth: node.data.depth + 1
                        },
                      };

                      setNodes((nds) => [...nds, newNode]);
                      setEdges((eds) => [
                        ...eds,
                        {
                          id: `edge-${nodeId}-${newNodeId}`,
                          source: nodeId,
                          target: newNodeId,
                          type: 'smoothstep',
                        },
                      ]);

                      generateAnswer(newNodeId, question.trim());
                    });
                  }
                }
                
                contentBufferRef.current = '';
              }
            }
          } catch (e) {
            console.error('Error parsing JSON in stream chunk:', e);
          }
        }
      }
    } catch (e) {
      console.error('Error processing stream chunk:', e);
    }
  }, [nodes, setNodes, setEdges, updateNodeData, handleRemoveNode, maxDepth, handleAddChildNode]);

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

  const handleAddChildNode = useCallback((parentId: string) => {
    const parentNode = nodes.find(node => node.id === parentId);
    if (!parentNode || parentNode.data.depth >= maxDepth) return;

    const childCount = edges.filter(edge => edge.source === parentId).length;
    const newNodeId = `${parentId}-${childCount + 1}`;

    const position = generateNodePosition(
      childCount,
      3,
      parentNode.position.x,
      parentNode.position.y,
      parentNode.data.depth + 1,
      maxDepth
    );

    const newNode: Node<QAData> = {
      id: newNodeId,
      type: 'qaNode',
      position,
      data: {
        question: 'New question...',
        answer: 'Analyzing...',
        updateNodeData,
        addChildNode: handleAddChildNode,
        removeNode: handleRemoveNode,
        depth: parentNode.data.depth + 1
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

    generateAnswer(newNodeId, 'New question...');
  }, [nodes, edges, maxDepth, setNodes, setEdges, generateAnswer]);

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

          const rootNode: Node<QAData> = {
            id: 'node-1',
            type: 'qaNode',
            position: { x: 0, y: 0 },
            data: {
              question: market.question,
              answer: 'Analyzing...',
              updateNodeData,
              addChildNode: handleAddChildNode,
              removeNode: handleRemoveNode,
              depth: 0
            }
          };
          setNodes([rootNode]);
          
          generateAnswer('node-1', market.question);
        } catch (error) {
          console.error('Error initializing tree:', error);
        }
      };

      initializeTree();
    }
  }, [nodes.length, marketId, setNodes, updateNodeData, handleRemoveNode, handleAddChildNode, generateAnswer]);

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