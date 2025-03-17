
/**
 * OpenRouter API client for Deno
 */
export class OpenRouter {
  private apiKey: string;
  private baseUrl = "https://openrouter.ai/api/v1";
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  /**
   * Create a completion using OpenRouter API
   * @param model Model to use
   * @param messages Messages for the model
   * @param maxTokens Maximum tokens to generate
   * @param temperature Temperature parameter
   * @param requestReasoning Whether to request reasoning
   * @param streamingCallback Optional callback for streaming responses
   * @returns The response content or { content, reasoning } object
   */
  async complete(
    model: string, 
    messages: Array<{role: string, content: string}>,
    maxTokens: number = 500,
    temperature: number = 0.7,
    requestReasoning: boolean = false,
    streamingCallback?: (partial: { content?: string, reasoning?: string }) => void
  ): Promise<string | { content: string, reasoning: string }> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is required");
    }
    
    try {
      const body: any = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature
      };
      
      // Add streaming if callback is provided
      const isStreaming = !!streamingCallback;
      if (isStreaming) {
        body.stream = true;
      }
      
      // Add reasoning configuration for DeepSeek R1
      if (requestReasoning && model === "deepseek/deepseek-r1") {
        body.extra = {
          reasoning: {
            enabled: true,
            effort: 0.8
          }
        };
      }
      
      console.log(`Making OpenRouter API request to ${model}${requestReasoning ? " with reasoning" : ""}${isStreaming ? " with streaming" : ""}`);
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hunchex.app'
        },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }
      
      // Handle streaming responses
      if (isStreaming) {
        if (!response.body) {
          throw new Error("Stream response body is null");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let contentAccumulator = "";
        let reasoningAccumulator = "";
        
        // Process the stream in a background task
        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n').filter(line => line.trim());
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim();
                  
                  if (jsonStr === '[DONE]') continue;
                  
                  try {
                    const parsed = JSON.parse(jsonStr);
                    const contentDelta = parsed.choices?.[0]?.delta?.content;
                    const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning;
                    
                    if (contentDelta) {
                      contentAccumulator += contentDelta;
                    }
                    
                    if (reasoningDelta) {
                      reasoningAccumulator += reasoningDelta;
                    }
                    
                    // Call the streaming callback with accumulated data
                    if (contentDelta || reasoningDelta) {
                      streamingCallback({
                        content: contentDelta ? contentAccumulator : undefined,
                        reasoning: reasoningDelta ? reasoningAccumulator : undefined
                      });
                    }
                  } catch (e) {
                    console.error('Error parsing SSE data:', e, 'Raw data:', jsonStr);
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error processing stream:', error);
          }
        })();
        
        // Return an object with empty content and reasoning
        // The real content will come through the streaming callback
        return requestReasoning ? {
          content: "",
          reasoning: ""
        } : "";
      }
      
      // Handle non-streaming responses (original code path)
      const data = await response.json();
      console.log(`OpenRouter response received, has choices: ${!!data.choices}, first choice: ${!!data.choices?.[0]}`);
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error(`Invalid response from OpenRouter API: ${JSON.stringify(data)}`);
      }
      
      // Check if reasoning is present in the response
      if (requestReasoning && 
          data.choices[0].message.reasoning && 
          typeof data.choices[0].message.reasoning === 'string') {
        console.log(`Reasoning found in response, length: ${data.choices[0].message.reasoning.length} chars`);
        return {
          content: data.choices[0].message.content,
          reasoning: data.choices[0].message.reasoning
        };
      } else if (requestReasoning) {
        console.log(`Reasoning was requested but not found in response`);
        // Always return in object format if reasoning was requested, even if not found
        return {
          content: data.choices[0].message.content,
          reasoning: "No reasoning provided by the model."
        };
      }
      
      // If reasoning wasn't requested, return just the content string for backward compatibility
      return data.choices[0].message.content;
    } catch (error) {
      console.error(`OpenRouter API request failed: ${error.message}`);
      throw error;
    }
  }
}
