import { useState, useEffect, useRef } from 'react';
import { useStreamingContent } from '@/hooks/useStreamingContent';
import { StreamingContentDisplay } from '@/components/market/research/StreamingContentDisplay';
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
import { Label } from "@/components/ui/label";
import { AnalysisDisplay } from "@/components/market/research/AnalysisDisplay";

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
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [similarities, setSimilarities] = useState<string[]>(['']);
  const [differences, setDifferences] = useState<string[]>(['']);
  // Web search options
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [maxSearchResults, setMaxSearchResults] = useState(3);
  // Streaming state
  const { content: streamingContent, isStreaming, startStreaming, addChunk, stopStreaming, rawBuffer, displayPosition } = useStreamingContent();
  const [showRawResponse, setShowRawResponse] = useState(true); // Show raw response by default
  const { user } = useCurrentUser();

  // Debug settings and logs
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [rawChunkLogs, setRawChunkLogs] = useState<{timestamp: number, size: number, content: string}[]>([]);
  const [showFullRawData, setShowFullRawData] = useState(false);
  const [streamStats, setStreamStats] = useState({
    chunkCount: 0,
    totalBytes: 0,
    startTime: 0,
    lastUpdate: 0
  });
  
  const addDebugLog = (message: string) => {
    console.log(`[HistoricalEventGenerator] ${message}`);
    setDebugLogs(prev => [...prev.slice(-20), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const addRawChunkLog = (content: string) => {
    const now = Date.now();
    setRawChunkLogs(prev => {
      // Keep only last 20 chunks
      const newLogs = [...prev.slice(-19), {
        timestamp: now,
        size: content.length,
        content: content
      }];
      return newLogs;
    });
    
    // Update stats
    setStreamStats(prev => ({
      chunkCount: prev.chunkCount + 1,
      totalBytes: prev.totalBytes + content.length,
      startTime: prev.startTime || now,
      lastUpdate: now
    }));
  };

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
      
      // Format all models for the dropdown
      const formattedModels = data.data.map((model: any) => ({
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

  const generateHistoricalEvent = async () => {
    if (!selectedModel) {
      toast.error("Please select a model");
      return;
    }

    setIsLoading(true);
    startStreaming(); // Start streaming and clear previous content
    
    // Reset debug stats and logs
    setDebugLogs([]);
    setRawChunkLogs([]);
    setStreamStats({
      chunkCount: 0,
      totalBytes: 0,
      startTime: Date.now(),
      lastUpdate: Date.now()
    });
    
    try {
      addDebugLog(`Starting historical event generation with model: ${selectedModel}`);

      // Call our edge function which will stream from OpenRouter
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-historical-event`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          marketQuestion,
          modelId: selectedModel,
          enableWebSearch,
          maxSearchResults,
          userId: user?.id // Pass user ID to fetch their API key on the server
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        addDebugLog(`API Error: ${response.status} - ${errorText}`);
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        addDebugLog("Response body is null");
        throw new Error("Response body is null");
      }

      // Process streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let chunkCounter = 0;
      let lastProcessTime = Date.now();

      addDebugLog("Starting to process stream from edge function...");

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          addDebugLog("Stream complete");
          if (buffer.trim().length > 0) {
            addDebugLog(`Processing final buffer content (${buffer.length} bytes)`);
            await processSSEBuffer(buffer, true);
          }
          break;
        }
        
        // Decode the chunk and add to buffer
        const chunkText = decoder.decode(value, { stream: true });
        chunkCounter++;
        buffer += chunkText;
        
        // Log chunk details
        const now = Date.now();
        const timeSinceLastChunk = now - lastProcessTime;
        lastProcessTime = now;
        
        addDebugLog(`[${chunkCounter}] Raw chunk: ${chunkText.length} bytes, interval: ${timeSinceLastChunk}ms`);
        addRawChunkLog(chunkText);
        
        // Process SSE messages
        await processSSEBuffer(buffer, false);
        
        // Keep only incomplete messages in the buffer
        const lastNewlineIndex = buffer.lastIndexOf('\n\n');
        if (lastNewlineIndex !== -1) {
          buffer = buffer.substring(lastNewlineIndex + 2);
        }
      }

      addDebugLog(`Stream processing complete. Total chunks: ${chunkCounter}`);
      toast.success("Historical event generated successfully!");
    } catch (error: any) {
      console.error("Error generating historical event:", error);
      addDebugLog(`Error: ${error.message}`);
      toast.error("Failed to generate historical event");
    } finally {
      setIsLoading(false);
      stopStreaming(); // Stop streaming and ensure full content is displayed
    }
    
    // Helper function to process SSE buffer and extract messages with improved logging
    async function processSSEBuffer(buffer: string, isFinal: boolean) {
      // Split by double newlines which separate SSE messages
      const events = buffer.split('\n\n');
      
      if (events.length > 1) {
        addDebugLog(`Processing ${events.length-1} complete events from buffer`);
      }
      
      for (let i = 0; i < events.length - 1; i++) {
        const event = events[i].trim();
        
        if (!event) continue;
        
        // Process each line in the event
        const lines = event.split('\n');
        
        let dataContent = '';
        // Collect all data: lines as they might be split across multiple lines
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            dataContent += line.substring(6);
          }
        }
        
        // Process the collected data content
        if (dataContent) {
          if (dataContent === '[DONE]') {
            addDebugLog("[DONE] marker received");
            continue;
          }
          
          try {
            const parsedData = JSON.parse(dataContent);
            
            // Extract content from choices[0].delta.content if available
            if (parsedData.choices && 
                parsedData.choices[0] && 
                parsedData.choices[0].delta) {
                
                const delta = parsedData.choices[0].delta;
                const content = delta.content || delta.reasoning || '';
                
                if (content) {
                  // Add the content directly to the stream display
                  addChunk(content);
                }
            }
          } catch (e: any) {
            addDebugLog(`Parse error: ${e.message}`);
          }
        }
      }
      
      // If this is the final processing and there's one event left, process it too
      if (isFinal && events.length > 0) {
        const finalEvent = events[events.length - 1].trim();
        if (finalEvent) {
          addDebugLog(`Processing final incomplete event: ${finalEvent.length} bytes`);
          
          // Try to extract any data lines
          const lines = finalEvent.split('\n');
          let dataContent = '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              dataContent += line.substring(6);
            }
          }
          
          if (dataContent) {
            try {
              const parsedData = JSON.parse(dataContent);
              
              if (parsedData.choices?.[0]?.delta?.content) {
                const content = parsedData.choices[0].delta.content;
                addDebugLog(`Final content extracted (${content.length} bytes)`);
                addChunk(content);
              }
            } catch (e: any) {
              addDebugLog(`Could not parse final fragment as JSON: ${e.message}`);
            }
          }
        }
      }
    }
  };

  // Function to parse raw response into structured format using Gemini 2.5 Flash
  const parseRawResponseToStructured = async () => {
    if (!streamingContent || !user?.openrouter_api_key) {
      toast.error("No content to parse or missing API key");
      return;
    }

    setIsLoading(true);
    try {
      const systemPrompt = `You are an expert at extracting structured information from text.
Your task is to analyze the provided text about a historical event comparison and extract key details into a structured format.

Format your response as a valid JSON object with the following structure:
{
  "title": "Name of the historical event",
  "date": "Date or time period (e.g., 'March 2008' or '1929-1932')",
  "image_url": "A relevant image URL mentioned in the text",
  "similarities": ["Similarity 1", "Similarity 2", "Similarity 3", "Similarity 4", "Similarity 5"],
  "differences": ["Difference 1", "Difference 2", "Difference 3", "Difference 4", "Difference 5"]
}`;

      const userPrompt = `Here is a text about a historical event comparison for the market question: "${marketQuestion}".
Please extract the structured information into the required JSON format.

TEXT:
${streamingContent}`;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${user.openrouter_api_key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error("No content in response");
      }

      // Parse the JSON response
      const parsedData = JSON.parse(content);
      
      // Update the form fields with the parsed data
      setEventTitle(parsedData.title || "");
      setEventDate(parsedData.date || "");
      setImageUrl(parsedData.image_url || "");
      setSimilarities(parsedData.similarities || ['']);
      setDifferences(parsedData.differences || ['']);
      
      toast.success("Successfully parsed response into structured format");
    } catch (error) {
      console.error("Error parsing response:", error);
      toast.error("Failed to parse response into structured format");
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

  // Calculate streaming stats
  const elapsedMs = streamStats.lastUpdate - streamStats.startTime;
  const avgChunkSize = streamStats.totalBytes / (streamStats.chunkCount || 1);
  const chunkRate = streamStats.chunkCount / (elapsedMs / 1000 || 1);

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
              disabled={isFetchingModels}
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
                  />
                </div>
              )}
            </div>

            {/* Debug Options */}
            <div className="space-y-3 p-3 bg-secondary/20 border border-secondary/30 rounded-md">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Debugging Options</h4>
                <Switch 
                  checked={showFullRawData}
                  onCheckedChange={setShowFullRawData}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-1 bg-secondary/10 rounded">
                  <span className="font-medium">Chunks:</span> {streamStats.chunkCount}
                </div>
                <div className="p-1 bg-secondary/10 rounded">
                  <span className="font-medium">Bytes:</span> {streamStats.totalBytes}
                </div>
                <div className="p-1 bg-secondary/10 rounded">
                  <span className="font-medium">Avg size:</span> {Math.round(avgChunkSize)} bytes
                </div>
                <div className="p-1 bg-secondary/10 rounded">
                  <span className="font-medium">Rate:</span> {chunkRate.toFixed(1)}/s
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-1 bg-secondary/10 rounded">
                  <span className="font-medium">Buffer size:</span> {rawBuffer?.length || 0}
                </div>
                <div className="p-1 bg-secondary/10 rounded">
                  <span className="font-medium">Display pos:</span> {displayPosition || 0}
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="show-raw-response" className="text-sm">Show Raw Response</Label>
              <Switch 
                id="show-raw-response"
                checked={showRawResponse}
                onCheckedChange={setShowRawResponse}
              />
            </div>
            
            <Button 
              onClick={generateHistoricalEvent} 
              disabled={isLoading || !selectedModel}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Historical Event"
              )}
            </Button>
            
            {/* Debug logs section */}
            <div className="mt-4 bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700 text-xs font-mono">
              <div className="flex justify-between items-center mb-1">
                <h4 className="font-medium">Stream Debug ({debugLogs.length} logs)</h4>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setDebugLogs([])}
                  className="h-6 text-xs"
                >
                  Clear
                </Button>
              </div>
              <div className="max-h-24 overflow-auto">
                {debugLogs.length === 0 ? 
                  <p className="text-muted-foreground">No logs yet</p> : 
                  debugLogs.map((log, i) => (
                    <div key={i} className="py-0.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      {log}
                    </div>
                  ))
                }
              </div>
            </div>
            
            {/* Raw Chunks Section */}
            <div className="mt-4 bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700 text-xs font-mono">
              <div className="flex justify-between items-center mb-1">
                <h4 className="font-medium">Raw Chunks ({rawChunkLogs.length})</h4>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setRawChunkLogs([])}
                  className="h-6 text-xs"
                >
                  Clear
                </Button>
              </div>
              <div className="max-h-32 overflow-auto">
                {rawChunkLogs.length === 0 ? (
                  <p className="text-muted-foreground">No chunks yet</p>
                ) : (
                  rawChunkLogs.map((chunk, i) => (
                    <div key={i} className="py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="flex justify-between">
                        <span className="font-semibold">Chunk #{i+1}</span>
                        <span>{new Date(chunk.timestamp).toLocaleTimeString()} • {chunk.size} bytes</span>
                      </div>
                      {showFullRawData ? (
                        <pre className="mt-1 p-1 bg-gray-100 dark:bg-gray-800 rounded overflow-x-auto whitespace-pre-wrap break-all text-[10px]">
                          {chunk.content}
                        </pre>
                      ) : (
                        <pre className="mt-1 p-1 bg-gray-100 dark:bg-gray-800 rounded overflow-x-auto text-[10px]">
                          {chunk.content.substring(0, 50)}
                          {chunk.content.length > 50 ? "..." : ""}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {/* Using StreamingContentDisplay */}
            {showRawResponse && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-medium">Raw Response (StreamingContentDisplay)</h4>
                  {streamingContent && !isStreaming && (
                    <Button
                      onClick={parseRawResponseToStructured}
                      size="sm"
                      variant="outline"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Parsing...
                        </>
                      ) : (
                        "Parse with Gemini Flash"
                      )}
                    </Button>
                  )}
                </div>

                {/* Use the updated StreamingContentDisplay component */}
                <StreamingContentDisplay 
                  content={streamingContent} 
                  isStreaming={isStreaming}
                  maxHeight="200px"
                  rawBuffer={rawBuffer}
                  displayPosition={displayPosition}
                />
              </div>
            )}

            {/* Form fields for event details */}
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Event Title</label>
                <Input
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Historical event title"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">Date/Period</label>
                <Input
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  placeholder="e.g., March 2008 or 1929-1932"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">Image URL</label>
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="URL to a relevant image"
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
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeSimilarity(index)}
                      disabled={similarities.length <= 1}
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
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeDifference(index)}
                      disabled={differences.length <= 1}
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
                >
                  Add Difference
                </Button>
              </div>
            </div>
              
            <Button 
              onClick={saveHistoricalEvent}
              disabled={isLoading || !eventTitle || !eventDate || !imageUrl}
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
