import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from "@/integrations/supabase/client";
import { toast } from 'sonner';
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface OpenRouterModel {
  id: string;
  name: string;
}

interface HistoricalEventGeneratorProps {
  marketId: string;
  marketQuestion: string;
  onEventSaved?: () => void;
}

export function HistoricalEventGenerator({ marketId, marketQuestion, onEventSaved }: HistoricalEventGeneratorProps) {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [similarities, setSimilarities] = useState<string[]>(['']);
  const [differences, setDifferences] = useState<string[]>(['']);
  // Raw response
  const [rawResponse, setRawResponse] = useState("");
  // Debug info
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  // Web search options
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [maxSearchResults, setMaxSearchResults] = useState(3);
  const { user } = useCurrentUser();
  const abortControllerRef = useRef<AbortController | null>(null);

  const addDebugLog = (message: string) => {
    // Log to console for immediate feedback during development
    console.log(`[${new Date().toISOString()}] ${message}`);
    
    // Update the UI with the log message
    setDebugLogs(prev => [...prev, `[${new Date().toISOString()}] ${message}`]);
  };

  // Clean up any fetch requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Fetch available models when the component mounts and user has an API key
  useEffect(() => {
    if (user?.openrouter_api_key) {
      fetchModels();
    }
  }, [user?.openrouter_api_key]);

  const fetchModels = async () => {
    if (!user?.openrouter_api_key) {
      toast.error("You need to add your OpenRouter API key in account settings");
      return;
    }

    setIsFetchingModels(true);
    try {
      // We only require structured_outputs parameter now
      const requiredParameters = ['structured_outputs'];
      
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${user.openrouter_api_key}`,
          "HTTP-Referer": window.location.origin,
        }
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Filter models that support structured_outputs
      const filteredData = data.data.filter(model => {
        if (!model.supported_parameters) return false;
        return requiredParameters.every(param => 
          model.supported_parameters.includes(param)
        );
      });
      
      // Format models for the dropdown
      const formattedModels = filteredData.map((model: any) => ({
        id: model.id,
        name: model.name || model.id
      }));

      setModels(formattedModels);
      
      // Set a default model if available
      if (formattedModels.length > 0) {
        // Try to find a good default model
        const defaultModel = formattedModels.find(m => 
          m.id.includes('gemini') || m.id.includes('claude') || m.id.includes('gpt')
        );
        setSelectedModel(defaultModel?.id || formattedModels[0].id);
      }
    } catch (error) {
      console.error("Error fetching models:", error);
      toast.error("Failed to fetch available models");
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSimilarityChange = (index: number, value: string) => {
    const newSimilarities = [...similarities];
    newSimilarities[index] = value;
    setSimilarities(newSimilarities);
  };

  const handleDifferenceChange = (index: number, value: string) => {
    const newDifferences = [...differences];
    newDifferences[index] = value;
    setDifferences(newDifferences);
  };

  const addSimilarity = () => {
    setSimilarities([...similarities, '']);
  };

  const addDifference = () => {
    setDifferences([...differences, '']);
  };

  const removeSimilarity = (index: number) => {
    if (similarities.length > 1) {
      const newSimilarities = [...similarities];
      newSimilarities.splice(index, 1);
      setSimilarities(newSimilarities);
    }
  };

  const removeDifference = (index: number) => {
    if (differences.length > 1) {
      const newDifferences = [...differences];
      newDifferences.splice(index, 1);
      setDifferences(newDifferences);
    }
  };

  // Process a single SSE message
  const processSSEMessage = (line: string) => {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim(); // Remove 'data: ' prefix
      
      if (data === '[DONE]') {
        addDebugLog('Received [DONE] marker');
        setIsStreaming(false);
        return;
      }
      
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        
        if (content) {
          addDebugLog(`Received content chunk: ${content.length} chars`);
          // Update UI immediately with each new chunk
          setRawResponse(prev => prev + content);
        }
      } catch (e) {
        // Handle raw text that isn't proper JSON format
        if (data && typeof data === 'string') {
          addDebugLog(`Received raw text: ${data.slice(0, 20)}...`);
          // Update UI immediately with each raw text chunk
          setRawResponse(prev => prev + data);
        } else {
          addDebugLog(`Error parsing JSON: ${e}, data: ${data}`);
        }
      }
    } else if (line.startsWith('event: ')) {
      const eventType = line.slice(7).trim();
      
      // Process the event in the next line if available
      return { eventType };
    } else if (line.startsWith('id: ') || line === '') {
      // Ignore ID lines and empty lines
      return;
    } else {
      addDebugLog(`Unknown line format: ${line}`);
    }
  };

  const generateHistoricalEvent = async () => {
    if (!selectedModel && !user?.openrouter_api_key) {
      toast.error("You need to add your OpenRouter API key in account settings");
      return;
    }

    setIsLoading(true);
    setIsStreaming(true);
    setRawResponse("");
    setDebugLogs([]);
    
    try {
      addDebugLog(`Starting historical event generation for question: ${marketQuestion}`);
      addDebugLog(`Using model: ${selectedModel}`);
      
      // Clean up any existing fetch
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Create a new AbortController for this request
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      
      // First get the auth token
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData.session?.access_token;
      
      if (!authToken) {
        throw new Error("No authentication token available");
      }
      
      // Prepare the request to the edge function
      const requestOptions = {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketQuestion,
          model: selectedModel,
          enableWebSearch,
          maxSearchResults,
          userId: user?.id
        }),
        signal
      };
      
      addDebugLog(`Making request to edge function with options: ${JSON.stringify(requestOptions)}`);
      
      // Make the request to the edge function
      const response = await fetch(
        "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-historical-event", 
        requestOptions
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edge function error: ${response.status} - ${errorText}`);
      }
      
      addDebugLog(`Received response with status: ${response.status}`);
      
      // Check if we have a streaming response
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        addDebugLog('Got SSE response, processing stream');
        
        // Set up a TextDecoder for converting Uint8Arrays to strings
        const decoder = new TextDecoder();
        
        // Get a reader from the response body stream
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader');
        }
        
        // Initialize variables for processing SSE
        let buffer = '';
        let pendingEventType: string | null = null;
        
        // Process the stream chunk by chunk
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              // Handle any remaining data in the buffer
              if (buffer.trim()) {
                const result = processSSEMessage(buffer.trim());
                if (result?.eventType && pendingEventType === null) {
                  pendingEventType = result.eventType;
                }
              }
              
              addDebugLog('Stream complete');
              setIsStreaming(false);
              break;
            }
            
            // Decode this chunk and add it to our buffer
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            // Process complete lines
            const lines = buffer.split('\n');
            buffer = ''; // Reset buffer
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              
              // Skip empty lines
              if (!line) continue;
              
              // If this is the last line and doesn't end with a newline
              if (i === lines.length - 1 && !chunk.endsWith('\n')) {
                buffer = line; // Keep it in the buffer for the next chunk
                continue;
              }
              
              // If we have a pending event type, this line should be the data for that event
              if (pendingEventType && line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                
                if (pendingEventType === 'message') {
                  addDebugLog(`Message event: ${data.length} chars`);
                  // Update UI immediately with new content
                  setRawResponse(prev => prev + data);
                } else if (pendingEventType === 'error') {
                  addDebugLog(`Error event: ${data}`);
                  toast.error(`Error: ${data}`);
                } else if (pendingEventType === 'done') {
                  addDebugLog(`Done event: ${data}`);
                  setIsStreaming(false);
                }
                
                pendingEventType = null; // Reset pending event
              } else {
                // Process this line normally
                const result = processSSEMessage(line);
                if (result?.eventType) {
                  pendingEventType = result.eventType;
                }
              }
            }
            
            // Ensure UI updates between chunks by forcing a microtask
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        } catch (error: any) {
          if (error.name === 'AbortError') {
            addDebugLog('Stream aborted by user');
          } else {
            throw error;
          }
        } finally {
          setIsStreaming(false);
          addDebugLog('Finished processing stream');
          toast.success('Historical event generated successfully!');
        }
      } else {
        // Handle regular JSON response
        const data = await response.json();
        setRawResponse(data.message || JSON.stringify(data));
        setIsStreaming(false);
        toast.success('Historical event generated successfully!');
      }
    } catch (error: any) {
      console.error("Error generating historical event:", error);
      addDebugLog(`Error: ${error.message}`);
      toast.error(`Failed to generate historical event: ${error.message}`);
      setIsStreaming(false);
    } finally {
      setIsLoading(false);
    }
  };

  const saveHistoricalEvent = async () => {
    if (!eventTitle || !eventDate || !imageUrl) {
      toast.error("Please provide all event details");
      return;
    }

    const filteredSimilarities = similarities.filter(item => item.trim() !== '');
    const filteredDifferences = differences.filter(item => item.trim() !== '');

    if (filteredSimilarities.length === 0 || filteredDifferences.length === 0) {
      toast.error("Please add at least one similarity and one difference");
      return;
    }

    setIsLoading(true);
    try {
      // First, insert or get the historical event
      const { data: eventData, error: eventError } = await supabase
        .from('historical_events')
        .upsert({
          title: eventTitle,
          date: eventDate,
          image_url: imageUrl
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // Then, create the market-event comparison
      const { error: comparisonError } = await supabase
        .from('market_historical_comparisons')
        .upsert({
          market_id: marketId,
          historical_event_id: eventData.id,
          similarities: filteredSimilarities,
          differences: filteredDifferences
        });

      if (comparisonError) throw comparisonError;

      toast.success("Historical event saved successfully!");
      
      // Reset form
      setEventTitle("");
      setEventDate("");
      setImageUrl("");
      setSimilarities(['']);
      setDifferences(['']);
      setRawResponse("");
      
      // Call the refetch function to update the list
      if (onEventSaved) {
        onEventSaved();
      }
    } catch (error: any) {
      console.error("Error saving historical event:", error);
      toast.error(`Failed to save historical event: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Generate Historical Event Comparison</h3>
      
      {!user?.openrouter_api_key ? (
        <div className="text-center p-4">
          <p className="text-muted-foreground mb-2">You need to add your OpenRouter API key in account settings to use this feature.</p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <label className="text-sm font-medium mb-1 block">Select Model</label>
            <Select
              value={selectedModel}
              onValueChange={setSelectedModel}
              disabled={isFetchingModels || isStreaming}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {isFetchingModels ? (
                  <div className="flex items-center justify-center p-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="ml-2">Loading models...</span>
                  </div>
                ) : models.length === 0 ? (
                  <div className="p-2 text-center text-sm text-muted-foreground">
                    No models available
                  </div>
                ) : (
                  models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4 mb-4">
            {/* Web Search Options */}
            <div className="space-y-3 p-3 bg-secondary/30 rounded-md">
              <h4 className="font-medium">Web Search Options</h4>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="web-search-toggle" className="text-sm">Enable Web Search</Label>
                <Switch 
                  id="web-search-toggle"
                  checked={enableWebSearch}
                  onCheckedChange={setEnableWebSearch}
                  disabled={isStreaming}
                />
              </div>
              
              {enableWebSearch && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="max-results-slider" className="text-sm">
                      Max Search Results: {maxSearchResults}
                    </Label>
                    <div className="text-xs text-muted-foreground">
                      (~${(maxSearchResults * 0.004).toFixed(3)} per request)
                    </div>
                  </div>
                  <Slider
                    id="max-results-slider"
                    min={1}
                    max={10}
                    step={1}
                    value={[maxSearchResults]}
                    onValueChange={([value]) => setMaxSearchResults(value)}
                    disabled={isStreaming}
                  />
                </div>
              )}
            </div>
            
            <Button 
              onClick={generateHistoricalEvent} 
              disabled={isLoading || !selectedModel || isStreaming}
              className="w-full"
            >
              {isStreaming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Receiving Stream...
                </>
              ) : isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Historical Event"
              )}
            </Button>

            {/* Raw Response Textarea */}
            {(rawResponse || isStreaming) && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-medium block">Generated Response</label>
                  {isStreaming && (
                    <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded animate-pulse">
                      Streaming...
                    </span>
                  )}
                </div>
                <Textarea
                  value={rawResponse}
                  onChange={(e) => setRawResponse(e.target.value)}
                  className="w-full min-h-[200px] font-mono text-sm"
                  placeholder={isStreaming ? "Receiving data..." : "Generated response will appear here"}
                  readOnly={isStreaming}
                />
              </div>
            )}

            {/* Debug Logs */}
            {debugLogs.length > 0 && (
              <div className="mt-4">
                <details className="mb-2">
                  <summary className="text-sm font-medium cursor-pointer">Debug Logs ({debugLogs.length})</summary>
                  <div className="mt-2 p-2 bg-muted/50 rounded max-h-[200px] overflow-auto">
                    {debugLogs.map((log, i) => (
                      <div key={i} className="text-xs font-mono mb-1">
                        {log}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Event Title</label>
                <Input
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Historical event title"
                  disabled={isStreaming}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">Date/Period</label>
                <Input
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  placeholder="e.g., March 2008 or 1929-1932"
                  disabled={isStreaming}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">Image URL</label>
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="URL to a relevant image"
                  disabled={isStreaming}
                />
                {imageUrl && (
                  <div className="mt-2">
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="max-h-32 object-cover rounded-md"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/600x400?text=Invalid+Image';
                      }}
                    />
                  </div>
                )}
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">Similarities</label>
                {similarities.map((similarity, index) => (
                  <div key={`sim-${index}`} className="flex gap-2 mb-2">
                    <Input
                      value={similarity}
                      onChange={(e) => handleSimilarityChange(index, e.target.value)}
                      placeholder={`Similarity ${index + 1}`}
                      disabled={isStreaming}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeSimilarity(index)}
                      disabled={similarities.length <= 1 || isStreaming}
                    >
                      -
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSimilarity}
                  className="mt-1"
                  disabled={isStreaming}
                >
                  Add Similarity
                </Button>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">Differences</label>
                {differences.map((difference, index) => (
                  <div key={`diff-${index}`} className="flex gap-2 mb-2">
                    <Input
                      value={difference}
                      onChange={(e) => handleDifferenceChange(index, e.target.value)}
                      placeholder={`Difference ${index + 1}`}
                      disabled={isStreaming}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeDifference(index)}
                      disabled={differences.length <= 1 || isStreaming}
                    >
                      -
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDifference}
                  className="mt-1"
                  disabled={isStreaming}
                >
                  Add Difference
                </Button>
              </div>
            </div>

            <Button 
              onClick={saveHistoricalEvent}
              disabled={isLoading || isStreaming || !eventTitle || !eventDate || !imageUrl}
              className="w-full"
              variant="default"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Historical Event"
              )}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
