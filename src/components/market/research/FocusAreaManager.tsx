
import { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, Search, GitFork, TrendingUp, BarChart } from 'lucide-react';
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FocusArea {
  id: string;
  text: string;
  parent?: string;
  effectiveness?: number;
  explorationStatus: 'unexplored' | 'in-progress' | 'explored';
  suggestedQueries?: string[];
  relatedAreas?: string[];
}

interface FocusAreaManagerProps {
  focusAreas: FocusArea[];
  currentFocus?: string;
  onSelectFocus: (focus: string) => void;
  onCreateFocus: (text: string, parentId?: string) => void;
}

export function FocusAreaManager({ 
  focusAreas,
  currentFocus,
  onSelectFocus,
  onCreateFocus
}: FocusAreaManagerProps) {
  const [newFocusText, setNewFocusText] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  
  // Group focus areas hierarchically
  const rootAreas = focusAreas.filter(area => !area.parent);
  const areasByParent: Record<string, FocusArea[]> = {};
  
  focusAreas.forEach(area => {
    if (area.parent) {
      if (!areasByParent[area.parent]) {
        areasByParent[area.parent] = [];
      }
      areasByParent[area.parent].push(area);
    }
  });
  
  const toggleGroupExpanded = (id: string) => {
    setExpandedGroups(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
  };
  
  const handleAddFocus = () => {
    if (newFocusText.trim()) {
      onCreateFocus(newFocusText.trim());
      setNewFocusText('');
    }
  };
  
  const getStatusColor = (status: FocusArea['explorationStatus']) => {
    switch (status) {
      case 'explored': return 'bg-green-500/20 text-green-700 hover:bg-green-500/20';
      case 'in-progress': return 'bg-amber-500/20 text-amber-700 hover:bg-amber-500/20';
      case 'unexplored': return 'bg-blue-500/20 text-blue-700 hover:bg-blue-500/20';
    }
  };
  
  const getStatusLabel = (status: FocusArea['explorationStatus']) => {
    switch (status) {
      case 'explored': return 'Explored';
      case 'in-progress': return 'In Progress';
      case 'unexplored': return 'Unexplored';
    }
  };
  
  const renderFocusArea = (area: FocusArea, depth = 0) => {
    const hasChildren = areasByParent[area.id]?.length > 0;
    const isExpanded = expandedGroups.includes(area.id);
    const isActive = area.text === currentFocus;
    
    return (
      <div key={area.id} className={`ml-${depth * 4} mb-2`}>
        <div 
          className={`flex items-center p-2 rounded-md ${
            isActive ? 'bg-primary/10 border border-primary/20' : 'hover:bg-accent/10'
          }`}
        >
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 mr-1"
              onClick={() => toggleGroupExpanded(area.id)}
            >
              {isExpanded ? '−' : '+'}
            </Button>
          )}
          
          <Target className="h-4 w-4 text-muted-foreground mr-2" />
          
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-medium truncate">{area.text}</div>
          </div>
          
          <Badge className={getStatusColor(area.explorationStatus)}>
            {getStatusLabel(area.explorationStatus)}
          </Badge>
          
          {!isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-7 px-2"
              onClick={() => onSelectFocus(area.text)}
            >
              Focus
            </Button>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <div className="ml-4 pl-2 border-l border-dashed border-accent mt-1">
            {areasByParent[area.id].map(child => renderFocusArea(child, depth + 1))}
          </div>
        )}
        
        {hasChildren && isExpanded && area.suggestedQueries && area.suggestedQueries.length > 0 && (
          <div className="ml-8 mt-1 mb-2">
            <div className="text-xs font-medium text-muted-foreground mb-1">Suggested Queries:</div>
            <div className="space-y-1">
              {area.suggestedQueries.map((query, i) => (
                <div key={i} className="flex items-center gap-1 text-xs pl-1">
                  <Search className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{query}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold">Focus Areas</h3>
      </div>
      
      <div className="mb-4">
        <div className="flex gap-2">
          <Input
            value={newFocusText}
            onChange={(e) => setNewFocusText(e.target.value)}
            placeholder="Add new focus area..."
            className="flex-1"
          />
          <Button onClick={handleAddFocus} size="sm">Add</Button>
        </div>
      </div>
      
      <div className="space-y-1">
        {rootAreas.map(area => renderFocusArea(area))}
      </div>
    </Card>
  );
}
