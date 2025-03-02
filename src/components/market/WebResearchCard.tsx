
import { useState, useEffect, useCallback } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  Slider 
} from "@/components/ui/slider"
import { supabase } from "@/integrations/supabase/client"
import { ResearchHeader } from "./research/ResearchHeader"
import { ProgressDisplay } from "./research/ProgressDisplay"
import { SitePreviewList } from "./research/SitePreviewList"
import { AnalysisDisplay } from "./research/AnalysisDisplay"
import { InsightsDisplay } from "./insights/InsightsDisplay"
import { ChevronDown, Settings } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useToast } from "@/components/ui/use-toast"
import { Json } from '@/integrations/supabase/types'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

// Properly structured interface definition for the component props
interface WebResearchCardProps {
  marketId: string
  question?: string
}

export function WebResearchCard({ marketId, question }: WebResearchCardProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [researchSession, setResearchSession] = useState<any>(null)
  const [iterations, setIterations] = useState<any[]>([])
  const [userQuery, setUserQuery] = useState<string>('')
  const [showSettings, setShowSettings] = useState(false)
  const [numResults, setNumResults] = useState<number>(3)
  const [streamingData, setStreamingData] = useState<{
    iterationId: string | null,
    content: string
  }>({
    iterationId: null,
    content: ''
  })

  // Fetch existing research sessions for this market
  const { data: existingResearch, isLoading: isLoadingExisting, refetch: refetchSessions } = useQuery({
    queryKey: ['research-sessions', marketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('research_sessions')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (error) throw error
      return data?.[0] || null
    }
  })

  // Fetch iterations if we have a session
  const { data: researchIterations, isLoading: isLoadingIterations, refetch: refetchIterations } = useQuery({
    queryKey: ['research-iterations', researchSession?.id],
    queryFn: async () => {
      if (!researchSession?.id) return []
      
      const { data, error } = await supabase
        .from('research_iterations')
        .select('*')
        .eq('session_id', researchSession.id)
        .order('created_at', { ascending: true })
      
      if (error) throw error
      return data || []
    },
    enabled: !!researchSession?.id
  })

  // Update local state when data is fetched
  useEffect(() => {
    if (existingResearch) {
      setResearchSession(existingResearch)
    }
  }, [existingResearch])

  useEffect(() => {
    if (researchIterations) {
      setIterations(researchIterations)
    }
  }, [researchIterations])

  const startNewSession = async () => {
    try {
      setIsLoading(true)
      
      // Create new research session
      const { data: session, error } = await supabase
        .from('research_sessions')
        .insert({
          market_id: marketId,
          question: question || '',
          status: 'active'
        })
        .select()
      
      if (error) throw error
      
      // Fetch the session to get its ID
      const { data: newSession } = await supabase
        .from('research_sessions')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      setResearchSession(newSession)
      setIterations([])
      await refetchSessions()
      await refetchIterations()
      
    } catch (error) {
      console.error('Error starting research session:', error)
      toast({
        title: "Error",
        description: "Failed to start research session",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const runResearchIteration = async () => {
    if (!researchSession?.id) {
      toast({
        title: "Error",
        description: "No active research session found",
        variant: "destructive"
      })
      return
    }
    
    if (!userQuery.trim()) {
      toast({
        title: "Error",
        description: "Please enter a search query",
        variant: "destructive"
      })
      return
    }
    
    try {
      setIsLoading(true)
      
      // Create new iteration
      const { data: iteration, error } = await supabase
        .from('research_iterations')
        .insert({
          session_id: researchSession.id,
          query: userQuery,
          num_results: numResults,
          status: 'pending'
        })
        .select()
      
      if (error) throw error
      
      // Refresh iterations
      await refetchIterations()
      
      // Execute web research
      const { data: updatedIteration, error: webError } = await supabase.functions.invoke('web-research', {
        body: {
          iterationId: iteration[0].id,
          query: userQuery,
          numResults: numResults,
          marketId,
          marketQuestion: question || ''
        }
      })
      
      if (webError) throw webError
      
      // Reset user query
      setUserQuery('')
      await refetchIterations()
      
    } catch (error) {
      console.error('Error running research iteration:', error)
      toast({
        title: "Error",
        description: "Failed to run research iteration",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Process streaming analysis and update UI with the chunk data
  const processAnalysisStream = async (iterationId: string) => {
    try {
      // Reset and prepare for streaming
      setStreamingData({
        iterationId,
        content: ''
      });
      
      const response = await supabase.functions.invoke('analyze-web-content', {
        body: {
          iterationId,
          marketId
        },
        responseType: 'stream'
      });
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to get stream reader');
      
      // Set up a text decoder to handle chunks
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        
        // Process each line in the chunk (SSE format)
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              // Extract just the data part
              const dataContent = line.substring(5).trim();
              
              if (dataContent === '[DONE]') continue;
              
              // Parse the JSON data
              const data = JSON.parse(dataContent);
              
              if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                // Extract the content from the delta
                const content = data.choices[0].delta.content;
                
                // Update the streaming data immediately
                requestAnimationFrame(() => {
                  setStreamingData(prev => ({
                    iterationId,
                    content: prev.content + content
                  }));
                });
              }
            } catch (e) {
              console.warn('Error parsing SSE data:', e);
            }
          }
        }
      }
      
      // Set streaming complete by updating the iteration in the database
      const { error } = await supabase
        .from('research_iterations')
        .update({ 
          analysis: streamingData.content,
          status: 'completed'
        })
        .eq('id', iterationId);
        
      if (error) throw error;
      
      // Clear streaming state after saving to DB
      setStreamingData({
        iterationId: null,
        content: ''
      });
      
      // Refresh iterations to get the updated data
      await refetchIterations();
      
    } catch (error) {
      console.error('Error analyzing content:', error);
      toast({
        title: "Error",
        description: "Failed to analyze content",
        variant: "destructive"
      });
      
      // Update iteration status to error
      await supabase
        .from('research_iterations')
        .update({ status: 'error' })
        .eq('id', iterationId);
    }
  };
  
  // Extract sources from the search results to display
  const getSourcesForIteration = (iteration: any) => {
    if (!iteration?.search_results) return []
    
    try {
      const results = iteration.search_results as { title: string, url: string }[]
      return results.map(r => ({ title: r.title, url: r.url }))
    } catch (e) {
      console.error('Error parsing search results:', e)
      return []
    }
  }
  
  return (
    <Card className="relative overflow-hidden">
      <ResearchHeader 
        title="Web Research"
        description={question ? `Research for: ${question}` : 'Search the web for information'}
        onStartNewSession={startNewSession}
        hasExistingSession={!!researchSession?.id}
      />
      
      {isLoading && (
        <div className="p-6">
          <ProgressDisplay status="Researching..." />
        </div>
      )}
      
      {researchSession?.id && !isLoading && (
        <div className="p-6 pt-0 space-y-4">
          {/* Search input */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-1.5">Search query</p>
              <input
                type="text"
                value={userQuery}
                onChange={e => setUserQuery(e.target.value)}
                placeholder="Enter a search query..."
                className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Popover open={showSettings} onOpenChange={setShowSettings}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Research Settings</h4>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <label className="text-sm">Number of results</label>
                        <span className="text-sm text-muted-foreground">{numResults}</span>
                      </div>
                      <Slider
                        defaultValue={[numResults]}
                        min={1}
                        max={5}
                        step={1}
                        onValueChange={(values) => setNumResults(values[0])}
                        className="w-full"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              <Button 
                onClick={runResearchIteration}
                disabled={isLoading || !userQuery}
              >
                Search
              </Button>
            </div>
          </div>
          
          {/* Iterations */}
          {iterations.length > 0 ? (
            <Accordion 
              type="single" 
              collapsible 
              defaultValue={iterations[iterations.length - 1]?.id}
              className="w-full space-y-2"
            >
              {iterations.map((iteration, index) => (
                <AccordionItem 
                  key={iteration.id}
                  value={iteration.id}
                  className="border p-1 rounded-lg"
                >
                  <AccordionTrigger className="px-4 py-2 hover:no-underline">
                    <div className="flex items-center gap-4 w-full">
                      <div className="flex-1 text-left">
                        <span className="font-medium">Iteration {index + 1}: </span>
                        <span className="text-muted-foreground">{iteration.query}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {iteration.status === 'completed' ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
                            Completed
                          </Badge>
                        ) : iteration.status === 'pending' || iteration.status === 'processing' ? (
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20">
                            {streamingData.iterationId === iteration.id ? 'Streaming' : 'Processing'}
                          </Badge>
                        ) : iteration.status === 'error' ? (
                          <Badge variant="outline" className="bg-red-500/10 text-red-500 hover:bg-red-500/20">
                            Error
                          </Badge>
                        ) : (
                          <Badge variant="outline">Unknown</Badge>
                        )}
                        
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(iteration.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  
                  <AccordionContent className="px-4 pb-4 pt-2">
                    <div className="space-y-4">
                      {/* Sources */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Sources</h4>
                        <SitePreviewList sites={getSourcesForIteration(iteration)} />
                      </div>
                      
                      {/* Analysis */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium">Analysis</h4>
                          
                          {iteration.status !== 'completed' && iteration.status !== 'error' && !streamingData.iterationId && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => processAnalysisStream(iteration.id)}
                            >
                              Analyze
                            </Button>
                          )}
                        </div>
                        
                        {streamingData.iterationId === iteration.id ? (
                          <AnalysisDisplay 
                            content={streamingData.content} 
                            isStreaming={true}
                          />
                        ) : iteration.analysis ? (
                          <AnalysisDisplay content={iteration.analysis} />
                        ) : iteration.status === 'error' ? (
                          <p className="text-sm text-red-500">Error analyzing content</p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No analysis yet</p>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">Run a search to start researching</p>
            </div>
          )}
        </div>
      )}
      
      {!researchSession?.id && !isLoading && (
        <div className="p-6 pt-0 flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground mb-4">No research session active</p>
          <Button onClick={startNewSession}>Start Research</Button>
        </div>
      )}
    </Card>
  )
}
