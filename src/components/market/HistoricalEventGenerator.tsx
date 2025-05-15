
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

      // Process the stream
      setStreamingStatus("Receiving data...");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let partialData = "";
      let allChunks = ""; // Store all chunks for debugging
      let chunkCount = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          appendDebugInfo("Stream reading complete");
          break;
        }
        
        const chunk = decoder.decode(value);
        partialData += chunk;
        allChunks += chunk; // Accumulate all chunks
        
        chunkCount++;
        appendDebugInfo(`CHUNK ${chunkCount}: ${JSON.stringify(chunk)}`);
        
        // Process the chunk to extract the JSON
        const lines = partialData.split("\n");
        appendDebugInfo(`Lines in this chunk: ${lines.length}`);
        
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          appendDebugInfo(`Processing line: ${line}`);
          
          if (line.startsWith("data: ")) {
            if (line === "data: [DONE]") {
              appendDebugInfo("Stream complete marker received");
              continue;
            }
            
            try {
              const jsonData = JSON.parse(line.substring(6));
              appendDebugInfo(`Parsed JSON from line: ${JSON.stringify(jsonData)}`);
              
              if (jsonData.choices && jsonData.choices[0]) {
                const contentDelta = jsonData.choices[0].delta?.content;
                
                if (contentDelta) {
                  appendDebugInfo(`Content delta: ${contentDelta}`);
                  setStreamingProgress(prev => Math.min(prev + 5, 90));
                  
                  // Update streaming status based on what's being generated
                  if (contentDelta.includes("title")) {
                    setStreamingStatus("Generating event title...");
                  } else if (contentDelta.includes("date")) {
                    setStreamingStatus("Determining historical date...");
                  } else if (contentDelta.includes("image_url")) {
                    setStreamingStatus("Finding relevant image...");
                  } else if (contentDelta.includes("similarities")) {
                    setStreamingStatus("Analyzing similarities...");
                  } else if (contentDelta.includes("differences")) {
                    setStreamingStatus("Identifying differences...");
                  }
                }
              }
            } catch (e) {
              appendDebugInfo(`Error parsing JSON from line: ${e.message}`);
              // Ignore parsing errors for incomplete JSON
            }
          }
        }
        
        // Update what's left to process
        partialData = lines[lines.length - 1];
      }
      
      appendDebugInfo("ALL DATA RECEIVED: " + allChunks);
      
      // Process the complete response
      setStreamingStatus("Finalizing response...");
      setStreamingProgress(95);
      
      appendDebugInfo("FINAL PARTIAL DATA: " + partialData);
      
      // Attempt different parsing approaches
      
      // 1. First attempt: Extract the full JSON using a regex
      appendDebugInfo("TRYING REGEX PATTERN 1:");
      const jsonMatch = allChunks.match(/data: ({.*})/s); // Use 's' flag to match across multiple lines
      appendDebugInfo(`REGEX MATCH 1 RESULT: ${jsonMatch ? 'Match found' : 'No match'}`);
      
      // 2. Second attempt: New regex pattern looking for data: followed by a complete JSON object
      appendDebugInfo("TRYING REGEX PATTERN 2:");
      const jsonMatch2 = allChunks.match(/data: ({[\s\S]*?})(?=\ndata:|$)/);
      appendDebugInfo(`REGEX MATCH 2 RESULT: ${jsonMatch2 ? 'Match found' : 'No match'}`);
      if (jsonMatch2) {
        appendDebugInfo(`REGEX MATCH 2 CONTENT: ${jsonMatch2[1]}`);
      }
      
      // 3. Third attempt: Search for complete JSON objects anywhere in the string
      appendDebugInfo("TRYING REGEX PATTERN 3:");
      const jsonMatch3 = allChunks.match(/({[\s\S]*?})/);
      appendDebugInfo(`REGEX MATCH 3 RESULT: ${jsonMatch3 ? 'Match found' : 'No match'}`);
      if (jsonMatch3) {
        appendDebugInfo(`REGEX MATCH 3 CONTENT: ${jsonMatch3[1]}`);
      }
      
      // 4. Try to find valid JSON in the stream data directly
      appendDebugInfo("ATTEMPTING MANUAL JSON EXTRACTION:");
      // Split by data: prefix and try to parse each section
      const dataParts = allChunks.split('data: ').filter(Boolean);
      appendDebugInfo(`Found ${dataParts.length} data: sections`);
      
      let validContent = null;
      
      for (let i = 0; i < dataParts.length; i++) {
        const part = dataParts[i].trim();
        appendDebugInfo(`Examining data section ${i+1}: ${part.substring(0, 100)}${part.length > 100 ? '...' : ''}`);
        
        // Skip the [DONE] marker
        if (part === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(part);
          appendDebugInfo(`Successfully parsed JSON from section ${i+1}`);
          
          // Check if this contains complete chat message content
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) {
            const content = parsed.choices[0].message.content;
            appendDebugInfo(`Found complete content in section ${i+1}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
            
            try {
              // Check if this content is valid JSON itself
              const contentJson = JSON.parse(content);
              appendDebugInfo("Content is valid JSON!");
              validContent = contentJson;
              break;
            } catch (e) {
              appendDebugInfo(`Content is not valid JSON: ${e.message}`);
            }
          }
        } catch (e) {
          appendDebugInfo(`Failed to parse section ${i+1}: ${e.message}`);
        }
      }
      
      // Try to manually extract the JSON object from the final message
      if (!validContent) {
        appendDebugInfo("ATTEMPTING BRUTE FORCE JSON EXTRACTION:");
        
        // Look for patterns that might indicate JSON objects
        const potentialJsons = allChunks.match(/({[\s\S]*?})/g) || [];
        appendDebugInfo(`Found ${potentialJsons.length} potential JSON objects`);
        
        for (let i = 0; i < potentialJsons.length; i++) {
          const jsonCandidate = potentialJsons[i];
          appendDebugInfo(`Testing JSON candidate ${i+1}: ${jsonCandidate.substring(0, 100)}${jsonCandidate.length > 100 ? '...' : ''}`);
          
          try {
            const parsedCandidate = JSON.parse(jsonCandidate);
            
            // Check if this looks like our expected object
            if (parsedCandidate.title && parsedCandidate.date && 
                parsedCandidate.image_url && 
                Array.isArray(parsedCandidate.similarities) && 
                Array.isArray(parsedCandidate.differences)) {
              
              appendDebugInfo(`Found valid event data in candidate ${i+1}!`);
              validContent = parsedCandidate;
              break;
            } else {
              appendDebugInfo(`Candidate ${i+1} doesn't match our schema.`);
            }
          } catch (e) {
            appendDebugInfo(`Candidate ${i+1} is not valid JSON: ${e.message}`);
          }
        }
      }
      
      // If we found valid content, use it
      if (validContent) {
        appendDebugInfo(`SUCCESSFUL EXTRACTION: ${JSON.stringify(validContent)}`);
        
        setEventTitle(validContent.title || "");
        setEventDate(validContent.date || "");
        setImageUrl(validContent.image_url || "");
        setSimilarities(validContent.similarities || ['']);
        setDifferences(validContent.differences || ['']);
        
        setStreamingProgress(100);
        setStreamingStatus("Completed!");
        toast.success("Historical event generated successfully!");
      } else {
        // Final desperate attempt: try to manually build the event data from the stream
        appendDebugInfo("ATTEMPTING MANUAL RECONSTRUCTION:");
        
        // Look for individual field values in the chunks
        const titleMatch = allChunks.match(/"title"\s*:\s*"([^"]+)"/);
        const dateMatch = allChunks.match(/"date"\s*:\s*"([^"]+)"/);
        const imageUrlMatch = allChunks.match(/"image_url"\s*:\s*"([^"]+)"/);
        
        const similaritiesMatch = allChunks.match(/"similarities"\s*:\s*\[([\s\S]*?)\]/);
        const differencesMatch = allChunks.match(/"differences"\s*:\s*\[([\s\S]*?)\]/);
        
        appendDebugInfo(`Title match: ${titleMatch ? titleMatch[1] : 'None'}`);
        appendDebugInfo(`Date match: ${dateMatch ? dateMatch[1] : 'None'}`);
        appendDebugInfo(`Image URL match: ${imageUrlMatch ? imageUrlMatch[1] : 'None'}`);
        appendDebugInfo(`Similarities match: ${similaritiesMatch ? 'Found' : 'None'}`);
        appendDebugInfo(`Differences match: ${differencesMatch ? 'Found' : 'None'}`);
        
        if (titleMatch && dateMatch && imageUrlMatch) {
          setEventTitle(titleMatch[1]);
          setEventDate(dateMatch[1]);
          setImageUrl(imageUrlMatch[1]);
          
          if (similaritiesMatch) {
            try {
              // Try to parse similarities array
              const similaritiesStr = `[${similaritiesMatch[1]}]`;
              const parsedSimilarities = JSON.parse(similaritiesStr.replace(/\n/g, ''));
              setSimilarities(Array.isArray(parsedSimilarities) ? parsedSimilarities : ['']);
            } catch (e) {
              appendDebugInfo(`Failed to parse similarities: ${e.message}`);
              setSimilarities(['']);
            }
          }
          
          if (differencesMatch) {
            try {
              // Try to parse differences array
              const differencesStr = `[${differencesMatch[1]}]`;
              const parsedDifferences = JSON.parse(differencesStr.replace(/\n/g, ''));
              setDifferences(Array.isArray(parsedDifferences) ? parsedDifferences : ['']);
            } catch (e) {
              appendDebugInfo(`Failed to parse differences: ${e.message}`);
              setDifferences(['']);
            }
          }
          
          setStreamingProgress(100);
          setStreamingStatus("Partially completed with manual extraction");
          toast.success("Historical event partially generated");
        } else {
          throw new Error("Failed to extract event data from response");
        }
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
