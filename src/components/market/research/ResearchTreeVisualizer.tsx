
import { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, ArrowRightCircle, Target, GitFork, ArrowLeftCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ResearchNode {
  id: string;
  focusText: string;
  parentId?: string;
  queryEffectiveness?: number;
  probability?: string;
  timestamp?: string;
  isActive?: boolean;
}

interface ResearchConnection {
  source: string;
  target: string;
  label?: string;
}

interface ResearchTreeVisualizerProps {
  nodes: ResearchNode[];
  activeNodeId?: string;
  onNodeSelect: (nodeId: string) => void;
}

export function ResearchTreeVisualizer({ 
  nodes, 
  activeNodeId,
  onNodeSelect 
}: ResearchTreeVisualizerProps) {
  const [connections, setConnections] = useState<ResearchConnection[]>([]);
  const [rootNodes, setRootNodes] = useState<ResearchNode[]>([]);
  const [childMap, setChildMap] = useState<Record<string, ResearchNode[]>>({});
  
  useEffect(() => {
    // Build connections and hierarchy
    const newConnections: ResearchConnection[] = [];
    const newChildMap: Record<string, ResearchNode[]> = {};
    const roots: ResearchNode[] = [];
    
    nodes.forEach(node => {
      if (node.parentId) {
        newConnections.push({
          source: node.parentId,
          target: node.id,
          label: node.focusText
        });
        
        if (!newChildMap[node.parentId]) {
          newChildMap[node.parentId] = [];
        }
        newChildMap[node.parentId].push(node);
      } else {
        roots.push(node);
      }
    });
    
    setConnections(newConnections);
    setRootNodes(roots);
    setChildMap(newChildMap);
  }, [nodes]);

  const renderNode = (node: ResearchNode, level: number = 0) => {
    const isActive = node.id === activeNodeId;
    const hasChildren = childMap[node.id] && childMap[node.id].length > 0;
    
    return (
      <div key={node.id} className="mt-2">
        <div 
          className={`flex items-center p-2 rounded-md gap-2 ${
            isActive ? 'bg-primary/10 border border-primary/20' : 'hover:bg-accent/10'
          }`}
        >
          <div className="flex-shrink-0 mr-1">
            {level > 0 ? (
              <GitFork className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Target className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-medium truncate">{node.focusText || "Root Research"}</div>
            
            {node.probability && (
              <div className="text-xs text-muted-foreground">
                Probability: {node.probability}
              </div>
            )}
          </div>
          
          {node.queryEffectiveness !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={node.queryEffectiveness >= 7 ? "success" : node.queryEffectiveness >= 4 ? "default" : "destructive"} className="ml-auto">
                    {node.queryEffectiveness}/10
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Query effectiveness score</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          <Button 
            variant="ghost" 
            size="sm"
            className={`h-8 px-2 ${isActive ? 'bg-primary/20' : ''}`}
            onClick={() => onNodeSelect(node.id)}
          >
            {isActive ? (
              <span className="text-xs">Current</span>
            ) : (
              <ArrowRightCircle className="h-3 w-3" />
            )}
          </Button>
        </div>
        
        {hasChildren && (
          <div className="ml-6 pl-2 border-l border-dashed border-accent">
            {childMap[node.id].map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Card className="p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <GitBranch className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold">Research Path Visualization</h3>
      </div>
      
      <div className="research-tree">
        {rootNodes.map(node => renderNode(node))}
      </div>
    </Card>
  );
}
