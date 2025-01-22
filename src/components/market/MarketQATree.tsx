import { useState, useCallback, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button"; 
import { supabase } from "@/integrations/supabase/client";
import { 
  ReactFlow, 
  Background, 
  Controls,
  Node,
  useNodesState, 
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { QANodeComponent } from './nodes/QANodeComponent';
import { generateNodePosition, createNode, createEdge } from './utils/nodeGenerator';

export function MarketQATree({ marketId, marketQuestion }: { marketId: string, marketQuestion: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const streamIntervals = useRef<{ [key: string]: NodeJS.Timeout }>({});

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

  const generateChildNodes = useCallback((parentId: string, questions: string[]) => {
    const parent = nodes.find(node => node.id === parentId);
    if (!parent) return;

    const parentElement = document.querySelector(`[data-id="${parentId}"]`) as HTMLElement;
    
    questions.forEach((question, i) => {
      const timestamp = Date.now() + i;
      const newNodeId = `node-${timestamp}`;
      
      const position = generateNodePosition(
        i,
        questions.length,
        parent.position.x,
        parent.position.y,
        1,
        3,
        parentElement
      );
      
      const newNode = createNode(newNodeId, position, {
        question: question,
        answer: '',
        updateNodeData,
      });

      const newEdge = createEdge(parentId, newNodeId, 1);

      setNodes(nds => [...nds, newNode]);
      setEdges(eds => [...eds, newEdge]);
    });
  }, [nodes, setNodes, setEdges, updateNodeData]);

  const parseStreamContent = (content: string) => {
    const analysisMatch = content.match(/ANALYSIS:\s*([\s\S]*?)(?=QUESTIONS:)/);
    const questionsMatch = content.match(/QUESTIONS:\s*([\s\S]*)/);
    
    if (analysisMatch && questionsMatch) {
      const analysis = analysisMatch[1].trim();
      const questionsText = questionsMatch[1];
      const questions = questionsText
        .split(/\d\./)
        .slice(1)
        .map(q => q.trim());
      
      return { analysis, questions };
    }
    return null;
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    
    // Create root node
    const rootId = 'root-node';
    setNodes([createNode(rootId, { x: 0, y: 0 }, {
      question: marketQuestion,
      answer: '',
      updateNodeData,
    })]);
    setCurrentNode(rootId);

    try {
      const { data: { body }, error } = await supabase.functions.invoke('generate-qa-tree', {
        body: { marketId, marketQuestion }
      });

      if (error) throw error;

      let accumulatedContent = '';
      const reader = new Response(body).body?.getReader();
      const decoder = new TextDecoder();

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                accumulatedContent += content;
                
                // Try to parse current content
                const parsed = parseStreamContent(accumulatedContent);
                if (parsed) {
                  // Update root node
                  updateNodeData(rootId, 'answer', parsed.analysis);
                  
                  // If we have questions, create child nodes
                  if (parsed.questions.length === 3) {
                    generateChildNodes(rootId, parsed.questions);
                  }
                }
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error analyzing market:', error);
    } finally {
      setIsAnalyzing(false);
      setCurrentNode(null);
    }
  };

  const nodeTypes = {
    qaNode: QANodeComponent
  };

  return (
    <Card className="p-4 mt-4 bg-card h-[600px] relative">
      <Button
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="absolute top-2 right-2 z-10"
      >
        {isAnalyzing ? 'Analyzing...' : 'Analyze'}
      </Button>
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
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
