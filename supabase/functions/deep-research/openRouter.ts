
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
   * @param onChunk Callback that receives each text chunk
   * @param maxTokens Maximum tokens to generate
   * @param temperature Temperature parameter
   * @returns The complete final text
   */
  async completeWithStream(
    model: string,
    messages: Array<{role: string, content: string}>,
    onChunk: (chunk: string) => Promise<void>,
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
          temperature,
          stream: true
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }
      
      if (!response.body) {
        throw new Error("Response body is null");
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";
      
      while (true) {
        const { value, done } = await reader.read();
        
        if (done) {
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        
        // Process the SSE format
        const lines = chunk
          .split('\n')
          .filter(line => line.trim() !== '' && line.trim() !== 'data: [DONE]');
        
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          
          try {
            const jsonData = JSON.parse(line.slice(5).trim());
            
            if (jsonData.choices && jsonData.choices.length > 0) {
              const content = jsonData.choices[0].delta?.content || '';
              if (content) {
                accumulatedText += content;
                await onChunk(content);
              }
            }
          } catch (e) {
            console.error('Error parsing JSON from stream:', e);
          }
        }
      }
      
      return accumulatedText;
    } catch (error) {
      console.error(`OpenRouter streaming API request failed: ${error.message}`);
      throw error;
    }
  }
}
