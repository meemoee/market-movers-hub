// Web Worker for handling streaming responses
// This runs on a separate thread to avoid blocking the main UI thread

self.onmessage = async function(e) {
  const { type, data } = e.data;
  
  if (type === 'START_STREAM') {
    const { url, options } = data;
    
    try {
      console.log('🔧 [WORKER] Starting stream request');
      
      const response = await fetch(url, options);
      
      if (!response.ok) {
        self.postMessage({
          type: 'ERROR',
          data: { error: `HTTP error! status: ${response.status}` }
        });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        self.postMessage({
          type: 'ERROR', 
          data: { error: 'No readable stream available' }
        });
        return;
      }

      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let accumulatedReasoning = '';
      
      // Process each chunk as it arrives
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('🏁 [WORKER] Stream completed');
          self.postMessage({
            type: 'STREAM_COMPLETE',
            data: { 
              content: accumulatedContent,
              reasoning: accumulatedReasoning 
            }
          });
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log('📦 [WORKER] Received chunk:', chunk.substring(0, 100) + '...');
        
        // Parse the chunk for content and reasoning
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6);
              if (jsonStr.trim() === '[DONE]') continue;
              
              const parsed = JSON.parse(jsonStr);
              
              if (parsed.content) {
                accumulatedContent += parsed.content;
                
                // Send immediate update to main thread
                self.postMessage({
                  type: 'CONTENT_CHUNK',
                  data: { 
                    content: accumulatedContent,
                    newChunk: parsed.content
                  }
                });
              }
              
              if (parsed.reasoning) {
                accumulatedReasoning += parsed.reasoning;
                
                self.postMessage({
                  type: 'REASONING_CHUNK', 
                  data: { 
                    reasoning: accumulatedReasoning,
                    newChunk: parsed.reasoning
                  }
                });
              }
            } catch (parseError) {
              console.warn('🚨 [WORKER] Parse error:', parseError);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('🚨 [WORKER] Stream error:', error);
      self.postMessage({
        type: 'ERROR',
        data: { error: error.message }
      });
    }
  }
};