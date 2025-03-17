
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
    streamingCallback?: (partialContent: string, partialReasoning?: string) => void
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
      
      // Add reasoning configuration for DeepSeek R1
      if (requestReasoning && model === "deepseek/deepseek-r1") {
        body.extra = {
          reasoning: {
            enabled: true,
            effort: 0.8
          }
        };
      }
      
      // Enable streaming if callback is provided
      if (streamingCallback) {
        body.stream = true;
      }
      
      console.log(`Making OpenRouter API request to ${model}${requestReasoning ? " with reasoning" : ""}${streamingCallback ? " (streaming)" : ""}`);
      
      // Handle streaming
      if (streamingCallback) {
        return this.handleStreamingRequest(
          model, 
          body, 
          streamingCallback, 
          requestReasoning
        );
      } else {
        // Non-streaming request (original implementation)
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
      }
    } catch (error) {
      console.error(`OpenRouter API request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle streaming request to OpenRouter API
   */
  private async handleStreamingRequest(
    model: string,
    body: any,
    streamingCallback: (partialContent: string, partialReasoning?: string) => void,
    requestReasoning: boolean
  ): Promise<{ content: string, reasoning: string }> {
    // Create variables to accumulate the full response
    let fullContent = "";
    let fullReasoning = "";
    
    // Make the streaming request
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'HTTP-Referer': 'https://hunchex.app'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }
    
    if (!response.body) {
      throw new Error("Response body is null");
    }
    
    // Create reader for the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        // Decode the chunk
        const chunk = decoder.decode(value);
        
        // Process SSE data
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.choices && data.choices.length > 0) {
                const choice = data.choices[0];
                
                // Handle delta content
                if (choice.delta && choice.delta.content) {
                  fullContent += choice.delta.content;
                }
                
                // Handle delta reasoning (for DeepSeek models)
                if (requestReasoning && choice.delta && choice.delta.reasoning) {
                  fullReasoning += choice.delta.reasoning;
                }
                
                // Call the streaming callback with current content
                streamingCallback(fullContent, requestReasoning ? fullReasoning : undefined);
              }
            } catch (parseError) {
              console.error(`Error parsing SSE data: ${parseError.message}`, line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    console.log(`Streaming completed: ${fullContent.length} chars content, ${fullReasoning.length} chars reasoning`);
    
    // Return the complete response
    return {
      content: fullContent,
      reasoning: fullReasoning || "No reasoning provided by the model."
    };
  }
}
