
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
import { AnalysisDisplay } from "./research/AnalysisDisplay"
import { InsightsDisplay } from "./insights/InsightsDisplay"
import { ChevronDown, Search, Settings } from 'lucide-react'
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

// Define interfaces for our data structures
interface ResearchSession {
  id: string
  market_id: string
  question: string
  status: string
  created_at: string
}

interface ResearchIteration {
  id: string
  session_id: string
  query: string
  num_results: number
  search_results?: { title: string, url: string }[]
  analysis?: string
  status: string
  created_at: string
}

interface SourceItem {
  title: string
  url: string
}

export function WebResearchCard({ marketId, question }: WebResearchCardProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [researchSession, setResearchSession] = useState<ResearchSession | null>(null)
  const [iterations, setIterations] = useState<ResearchIteration[]>([])
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

  // Fetch existing research sessions for this market using web_research table
  const { data: existingResearch, isLoading: isLoadingExisting, refetch: refetchSessions } = useQuery({
    queryKey: ['web-research', marketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('web_research')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (error) throw error
      
      // Convert to our internal format
      if (data && data.length > 0) {
        return {
          id: data[0].id,
          market_id: data[0].market_id,
          question: data[0].query,
          status: 'active',
          created_at: data[0].created_at
        } as ResearchSession
      }
      return null
    }
  })

  // Fetch iterations if we have a session - using the iterations field in web_research
  const { data: researchIterations, isLoading: isLoadingIterations, refetch: refetchIterations } = useQuery({
    queryKey: ['web-research-iterations', researchSession?.id],
    queryFn: async () => {
      if (!researchSession?.id) return []
      
      const { data, error } = await supabase
        .from('web_research')
        .select('iterations')
        .eq('id', researchSession.id)
      
      if (error) throw error
      
      // Convert from JSON to our internal format
      const iterations = data[0]?.iterations as any[] || []
      return iterations.map(iter => ({
        id: iter.id || crypto.randomUUID(),
        session_id: researchSession.id,
        query: iter.query,
        num_results: iter.num_results || 3,
        search_results: iter.search_results,
        analysis: iter.analysis,
        status: iter.status || 'completed',
        created_at: iter.created_at || new Date().toISOString()
      })) as ResearchIteration[]
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
      
      // Create new research session in web_research table
      const { data, error } = await supabase
        .from('web_research')
        .insert({
          market_id: marketId,
          query: question || '',
          analysis: 'No analysis yet',
          sources: [],
          areas_for_research: [],
          probability: 'Unknown',
          user_id: '00000000-0000-0000-0000-000000000000', // Placeholder
          iterations: []
        })
        .select()
      
      if (error) throw error
      
      // Set the new session
      const newSession = {
        id: data[0].id,
        market_id: data[0].market_id,
        question: data[0].query,
        status: 'active',
        created_at: data[0].created_at
      } as ResearchSession
      
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
      
      // Get the current iterations
      const { data: currentData, error: currentError } = await supabase
        .from('web_research')
        .select('iterations')
        .eq('id', researchSession.id)
        .single()
      
      if (currentError) throw currentError
      
      // Create new iteration
      const newIteration = {
        id: crypto.randomUUID(),
        query: userQuery,
        num_results: numResults,
        status: 'pending',
        created_at: new Date().toISOString(),
        search_results: []
      }
      
      // Update the iterations in the web_research table
      const iterationsArray = [...(currentData.iterations || []), newIteration]
      
      const { error: updateError } = await supabase
        .from('web_research')
        .update({ iterations: iterationsArray })
        .eq('id', researchSession.id)
      
      if (updateError) throw updateError
      
      // Execute web research
      const { data: searchResults, error: webError } = await supabase.functions.invoke('web-research', {
        body: {
          iterationId: newIteration.id,
          query: userQuery,
          numResults: numResults,
          marketId,
          marketQuestion: question || ''
        }
      })
      
      if (webError) throw webError
      
      // Update the iteration with search results
      const { data: updatedData } = await supabase
        .from('web_research')
        .select('iterations')
        .eq('id', researchSession.id)
        .single()
      
      const updatedIterations = updatedData.iterations.map((iter: any) => {
        if (iter.id === newIteration.id) {
          return {
            ...iter,
            search_results: searchResults?.results || [],
            status: 'completed'
          }
        }
        return iter
      })
      
      await supabase
        .from('web_research')
        .update({ iterations: updatedIterations })
        .eq('id', researchSession.id)
      
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
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      // Since we can't use streaming directly with the Supabase client,
      // let's simulate streaming by processing the response in chunks
      const content = response.data.analysis || '';
      
      // Simulate streaming by processing each character with slight delay
      for (let i = 0; i < content.length; i += 3) {
        const chunk = content.substring(i, i + 3);
        
        // Update the state immediately with each chunk
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            setStreamingData(prev => ({
              iterationId,
              content: prev.content + chunk
            }));
            resolve();
          });
        });
        
        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      
      // Update the iterations in the database
      const { data } = await supabase
        .from('web_research')
        .select('iterations')
        .eq('id', researchSession?.id)
        .single();
        
      if (!data) throw new Error('No session data found');
      
      const updatedIterations = data.iterations.map((iter: any) => {
        if (iter.id === iterationId) {
          return {
            ...iter,
            analysis: streamingData.content,
            status: 'completed'
          };
        }
        return iter;
      });
      
      const { error } = await supabase
        .from('web_research')
        .update({ 
          iterations: updatedIterations
        })
        .eq('id', researchSession?.id);
        
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
      
      // Update iteration status to error in the database
      if (researchSession?.id) {
        const { data } = await supabase
          .from('web_research')
          .select('iterations')
          .eq('id', researchSession.id)
          .single();
        
        if (data) {
          const updatedIterations = data.iterations.map((iter: any) => {
            if (iter.id === iterationId) {
              return {
                ...iter,
                status: 'error'
              };
            }
            return iter;
          });
          
          await supabase
            .from('web_research')
            .update({ iterations: updatedIterations })
            .eq('id', researchSession.id);
        }
      }
    }
  };
  
  // Extract sources from the search results to display
  const getSourcesForIteration = (iteration: ResearchIteration): SourceItem[] => {
    if (!iteration?.search_results) return []
    
    try {
      return iteration.search_results.map(r => ({ title: r.title, url: r.url }))
    } catch (e) {
      console.error('Error parsing search results:', e)
      return []
    }
  }
  
  return (
    <Card className="relative overflow-hidden">
      <div className="p-6 pb-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Web Research</h3>
            <p className="text-sm text-muted-foreground">
              {question ? `Research for: ${question}` : 'Search the web for information'}
            </p>
          </div>
          
          {researchSession && (
            <Button 
              onClick={startNewSession}
              variant="outline"
              size="sm"
            >
              New Session
            </Button>
          )}
        </div>
      </div>
      
      {isLoading && (
        <div className="p-6">
          <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden h-40">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-3 py-1 text-sm animate-pulse">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
                  <span className="text-foreground">Researching...</span>
                </div>
              </div>
            </ScrollArea>
          </div>
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
                        <div className="ScrollArea className='h-[200px] rounded-md border p-4'">
                          <div className="mb-2 text-sm text-muted-foreground">
                            {getSourcesForIteration(iteration).length} {getSourcesForIteration(iteration).length === 1 ? 'source' : 'sources'} collected
                          </div>
                          {getSourcesForIteration(iteration).map((result, idx) => (
                            <div key={idx} className="mb-4 last:mb-0 p-3 bg-accent/5 rounded-lg">
                              <div className="flex items-center gap-2">
                                <img 
                                  src={`https://www.google.com/s2/favicons?domain=${new URL(result.url).hostname}`}
                                  alt=""
                                  className="w-4 h-4"
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'%3E%3C/circle%3E%3Cline x1='2' y1='12' x2='22' y2='12'%3E%3C/line%3E%3Cpath d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'%3E%3C/path%3E%3C/svg%3E";
                                  }}
                                />
                                <h4 className="text-sm font-medium">
                                  {result.title || new URL(result.url).hostname}
                                </h4>
                              </div>
                              <a 
                                href={result.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline block mt-1"
                              >
                                {result.url}
                              </a>
                            </div>
                          ))}
                        </div>
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
