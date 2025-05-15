import { useState, useEffect } from 'react';
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
import { Progress } from "@/components/ui/progress";

interface OpenRouterModel {
  id: string;
  name: string;
}

interface HistoricalEventGeneratorProps {
  marketId: string;
  marketQuestion: string;
  onEventSaved?: () => void;
}

// Define the expected structure of the historical event data
interface HistoricalEventData {
  title: string;
  date: string;
  image_url: string;
  similarities: string[];
  differences: string[];
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
  const [streamingProgress, setStreamingProgress] = useState(0);
  const [streamingStatus, setStreamingStatus] = useState("");
  // Debug state
  const [debugInfo, setDebugInfo] = useState<string>("");
  
  const { user } = useCurrentUser();

  // Fetch available models when the component mounts and user has an API key
  useEffect(() => {
    if (user?.openrouter_api_key) {
      fetchModels();
    }
  }, [user?.openrouter_api_key]);

  const appendDebugInfo = (info: string) => {
    setDebugInfo(prev => prev + "\n" + info);
    console.log(info);
  };

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

  // Properly process SSE stream data
  const processSSEStream = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    
    appendDebugInfo("Starting to process SSE stream...");
    
    try {
      // This will collect the complete JSON content as it arrives in chunks
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          appendDebugInfo("Stream complete");
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        appendDebugInfo(`Received chunk: ${chunk.length} bytes`);
        
        // Process each line that ends with a newline
        let lines = buffer.split('\n');
        // Keep the last line in the buffer as it might be incomplete
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            const dataContent = line.substring(6);
            
            if (dataContent === '[DONE]') {
              appendDebugInfo("Received [DONE] marker");
              continue;
            }
            
            try {
              const jsonData = JSON.parse(dataContent);
              appendDebugInfo(`Parsed JSON data: ${JSON.stringify(jsonData).substring(0, 100)}...`);
              
              // Extract content from the delta
              if (jsonData.choices && jsonData.choices[0] && jsonData.choices[0].delta) {
                const contentDelta = jsonData.choices[0].delta.content || '';
                
                if (contentDelta) {
                  fullContent += contentDelta;
                  updateStreamingStatus(contentDelta);
                  setStreamingProgress(prev => Math.min(prev + 2, 90));
                }
              } else if (jsonData.choices && jsonData.choices[0] && jsonData.choices[0].message) {
                // Some models might return full message instead of delta
                const content = jsonData.choices[0].message.content || '';
                
                if (content && typeof content === 'string') {
                  fullContent = content;
                  updateStreamingStatus(content);
                  setStreamingProgress(90);
                }
              }
            } catch (e) {
              appendDebugInfo(`Error parsing JSON data: ${e.message}, data: ${dataContent}`);
            }
          } else {
            appendDebugInfo(`Skipping non-data line: ${line}`);
          }
        }
      }
      
      appendDebugInfo("Stream processing complete");
      
      // After collecting all content, try to parse the complete JSON
      appendDebugInfo(`Full collected content: ${fullContent}`);
      
      // Extract JSON object from the content
      // The content might be wrapped in markdown code blocks or have other text
      return parseJsonFromContent(fullContent);
      
    } catch (error) {
      appendDebugInfo(`Error processing stream: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  };
  
  // Update streaming status based on content
  const updateStreamingStatus = (content: string) => {
    if (content.includes("title")) {
      setStreamingStatus("Generating event title...");
    } else if (content.includes("date")) {
      setStreamingStatus("Determining historical date...");
    } else if (content.includes("image_url")) {
      setStreamingStatus("Finding relevant image...");
    } else if (content.includes("similarities")) {
      setStreamingStatus("Analyzing similarities...");
    } else if (content.includes("differences")) {
      setStreamingStatus("Identifying differences...");
    }
  };
  
  // Extract and parse JSON from content that might contain other text
  const parseJsonFromContent = (content: string): HistoricalEventData | null => {
    appendDebugInfo("Attempting to extract JSON from content");
    
    // First try: direct JSON parse
    try {
      const parsed = JSON.parse(content);
      if (isValidHistoricalEvent(parsed)) {
        appendDebugInfo("Successfully parsed direct JSON");
        return parsed;
      }
    } catch (e) {
      appendDebugInfo(`Direct JSON parse failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Second try: find JSON between curly braces
    try {
      const jsonMatch = content.match(/{[\s\S]*?}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        appendDebugInfo(`Found JSON-like structure: ${jsonStr.substring(0, 100)}...`);
        
        const parsed = JSON.parse(jsonStr);
        if (isValidHistoricalEvent(parsed)) {
          appendDebugInfo("Successfully parsed JSON from curly braces");
          return parsed;
        }
      }
    } catch (e) {
      appendDebugInfo(`JSON extraction from curly braces failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Third try: extract individual fields manually
    try {
      appendDebugInfo("Attempting manual field extraction");
      
      const titleMatch = content.match(/"title"\s*:\s*"([^"]+)"/);
      const dateMatch = content.match(/"date"\s*:\s*"([^"]+)"/);
      const imageUrlMatch = content.match(/"image_url"\s*:\s*"([^"]+)"/);
      
      // More complex extraction for arrays
      const similaritiesMatch = content.match(/"similarities"\s*:\s*\[([\s\S]*?)\]/);
      const differencesMatch = content.match(/"differences"\s*:\s*\[([\s\S]*?)\]/);
      
      if (titleMatch && dateMatch && imageUrlMatch) {
        const event: HistoricalEventData = {
          title: titleMatch[1],
          date: dateMatch[1],
          image_url: imageUrlMatch[1],
          similarities: [],
          differences: []
        };
        
        // Process similarities array
        if (similaritiesMatch) {
          event.similarities = extractStringArray(similaritiesMatch[1]);
        }
        
        // Process differences array
        if (differencesMatch) {
          event.differences = extractStringArray(differencesMatch[1]);
        }
        
        appendDebugInfo(`Manually extracted event: ${JSON.stringify(event)}`);
        
        if (isValidHistoricalEvent(event)) {
          appendDebugInfo("Manual extraction succeeded");
          return event;
        }
      }
    } catch (e) {
      appendDebugInfo(`Manual extraction failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    appendDebugInfo("Failed to extract valid historical event data");
    return null;
  };
  
  // Extract string array from JSON array text
  const extractStringArray = (arrayText: string): string[] => {
    const items: string[] = [];
    const itemMatches = arrayText.match(/"([^"]+)"/g);
    
    if (itemMatches) {
      for (const match of itemMatches) {
        // Remove the surrounding quotes
        items.push(match.substring(1, match.length - 1));
      }
    }
    
    return items;
  };
  
  // Validate if the object has the required fields for a historical event
  const isValidHistoricalEvent = (obj: any): obj is HistoricalEventData => {
    return obj && 
      typeof obj.title === 'string' && 
      typeof obj.date === 'string' && 
      typeof obj.image_url === 'string' && 
      Array.isArray(obj.similarities) && 
      Array.isArray(obj.differences);
  };

  const generateHistoricalEvent = async () => {
    if (!user?.openrouter_api_key) {
      toast.error("You need to add your OpenRouter API key in account settings");
      return;
    }

    if (!selectedModel) {
      toast.error("Please select a model");
      return;
    }

    setIsLoading(true);
    setStreamingProgress(0);
    setStreamingStatus("Preparing request...");
    setDebugInfo(""); // Clear previous debug info
    
    try {
      const promptText = `Generate a historical event comparison for the market question: "${marketQuestion}".`;
      
      // Base request body
      const requestBody: any = {
        model: enableWebSearch ? `${selectedModel}:online` : selectedModel,
        messages: [
          { role: "system", content: "You are a helpful assistant that generates historical event comparisons for market analysis." },
          { role: "user", content: promptText }
        ],
        stream: true,
        response_format: { 
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Name of the historical event"
              },
              date: {
                type: "string",
                description: "Date or time period (e.g., 'March 2008' or '1929-1932')"
              },
              image_url: {
                type: "string",
                description: "A relevant image URL"
              },
              similarities: {
                type: "array",
                items: {
                  type: "string"
                },
                description: "List of similarities between the market question and historical event"
              },
              differences: {
                type: "array",
                items: {
                  type: "string"
                },
                description: "List of differences between the market question and historical event"
              }
            },
            required: ["title", "date", "image_url", "similarities", "differences"]
          }
        }
      };
      
      // Add web search plugin configuration if enabled with custom max results
      if (enableWebSearch) {
        requestBody.plugins = [
          {
            id: "web",
            max_results: maxSearchResults
          }
        ];
      }

      appendDebugInfo("REQUEST BODY: " + JSON.stringify(requestBody, null, 2));
      setStreamingStatus("Connecting to OpenRouter...");
      
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${user.openrouter_api_key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        appendDebugInfo("OpenRouter API error status: " + response.status);
        appendDebugInfo("OpenRouter API error response: " + errorText);
        throw new Error(`Error ${response.status}: ${errorText}`);
      }
      
      if (!response.body) {
        throw new Error("Response body is null");
      }

      setStreamingStatus("Processing response stream...");
      const reader = response.body.getReader();
      
      // Process the SSE stream and get the resulting data
      const historicalEvent = await processSSEStream(reader);
      
      if (historicalEvent) {
        appendDebugInfo(`Successfully extracted historical event: ${JSON.stringify(historicalEvent)}`);
        
        // Update UI with the extracted data
        setEventTitle(historicalEvent.title);
        setEventDate(historicalEvent.date);
        setImageUrl(historicalEvent.image_url);
        setSimilarities(historicalEvent.similarities.length ? historicalEvent.similarities : ['']);
        setDifferences(historicalEvent.differences.length ? historicalEvent.differences : ['']);
        
        setStreamingProgress(100);
        setStreamingStatus("Completed!");
        toast.success("Historical event generated successfully!");
      } else {
        throw new Error("Failed to extract valid historical event data from response");
      }
    } catch (error: any) {
      console.error("Error generating historical event:", error);
      appendDebugInfo(`FINAL ERROR: ${error.message}`);
      appendDebugInfo(`ERROR STACK: ${error.stack || 'No stack available'}`);
      toast.error(`Failed to generate historical event: ${error.message}`);
      setStreamingStatus("Error occurred");
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
            
            {/* Debug Info */}
            {debugInfo && (
              <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
                <h4 className="text-sm font-medium mb-1">Debug Information:</h4>
                <pre className="text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                  {debugInfo}
                </pre>
              </div>
            )}
            
            {/* Streaming Progress Display */}
            {isLoading && (
              <div className="space-y-2 my-3">
                <div className="flex justify-between items-center text-sm">
                  <span>{streamingStatus}</span>
                  <span>{streamingProgress}%</span>
                </div>
                <Progress value={streamingProgress} className="w-full" />
              </div>
            )}
            
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
