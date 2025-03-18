
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
   * @returns The response content
   */
  async complete(
    model: string, 
    messages: Array<{role: string, content: string}>,
    maxTokens: number = 500,
    temperature: number = 0.7
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is required");
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hunchex.app'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }
      
      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error(`Invalid response from OpenRouter API: ${JSON.stringify(data)}`);
      }
      
      return data.choices[0].message.content;
    } catch (error) {
      console.error(`OpenRouter API request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a streaming completion using OpenRouter API
   * @param model Model to use
   * @param messages Messages for the model
   * @param maxTokens Maximum tokens to generate
   * @param temperature Temperature parameter
   * @returns The response as a ReadableStream
   */
  async completeStreaming(
    model: string, 
    messages: Array<{role: string, content: string}>,
    maxTokens: number = 500,
    temperature: number = 0.7
  ): Promise<Response> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is required");
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hunchex.app'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
          stream: true
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }
      
      return response;
    } catch (error) {
      console.error(`OpenRouter API streaming request failed: ${error.message}`);
      throw error;
    }
  }
}
