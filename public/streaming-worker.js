// Web Worker for handling streaming responses
// This runs on a separate thread to avoid blocking the main UI thread

self.onmessage = async function(e) {
  const { type, data } = e.data;
  
  if (type === 'TEST_CHUNKS') {
    console.log('🧪 [WORKER] Starting test chunk sequence');
    
    // Send test chunks to verify real-time updates
    const testChunks = ['Hello', ' there!', ' This', ' is', ' a', ' test', ' of', ' real-time', ' streaming.'];
    
    for (let i = 0; i < testChunks.length; i++) {
      const chunk = testChunks[i];
      const accumulated = testChunks.slice(0, i + 1).join('');
      
      console.log(`📦 [WORKER] Test chunk ${i + 1}/${testChunks.length}: "${chunk}"`);
      console.log(`📝 [WORKER] Accumulated so far: "${accumulated}"`);
      
      self.postMessage({
        type: 'CONTENT_CHUNK',
        data: { 
          content: accumulated,
          newChunk: chunk
        }
      });
      
      // Wait 500ms between chunks to simulate real streaming
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('🏁 [WORKER] Test sequence complete');
    self.postMessage({
      type: 'STREAM_COMPLETE',
      data: { 
        content: testChunks.join(''),
        reasoning: '' 
      }
    });
    return;
  }
  
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
      let lineBuffer = ''; // Buffer for incomplete SSE lines
      
      // Process each chunk as it arrives - IMMEDIATELY
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

        const rawChunk = decoder.decode(value, { stream: true });
        console.log('📦 [WORKER] Raw chunk received:', rawChunk.substring(0, 100));
        
        // Handle incomplete SSE lines across chunks
        const fullText = lineBuffer + rawChunk;
        const lines = fullText.split('\n');
        
        // Process all complete lines (all but the last, unless it ends with \n)
        const completeLines = fullText.endsWith('\n') ? lines : lines.slice(0, -1);
        lineBuffer = fullText.endsWith('\n') ? '' : lines[lines.length - 1];
        
        console.log('📝 [WORKER] Processing', completeLines.length, 'complete lines');
        
        for (const line of completeLines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') continue;
              
              const parsed = JSON.parse(jsonStr);
              
              // Handle different response formats
              let content = null;
              let reasoning = null;
              
              // Check for OpenRouter/OpenAI format
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                content = parsed.choices[0].delta.content;
                reasoning = parsed.choices[0].delta.reasoning;
              }
              // Check for direct content/reasoning format
              else if (parsed.content || parsed.reasoning) {
                content = parsed.content;
                reasoning = parsed.reasoning;
              }
              
              console.log('📊 [WORKER] Found content:', content, 'reasoning:', reasoning);
              
              if (content) {
                accumulatedContent += content;
                console.log('🚀 [WORKER] Sending content chunk immediately, total length:', accumulatedContent.length);
                
                // Send IMMEDIATELY to main thread
                self.postMessage({
                  type: 'CONTENT_CHUNK',
                  data: { 
                    content: accumulatedContent,
                    newChunk: content
                  }
                });
              }
              
              if (reasoning) {
                accumulatedReasoning += reasoning;
                console.log('🧠 [WORKER] Sending reasoning chunk immediately');
                
                self.postMessage({
                  type: 'REASONING_CHUNK', 
                  data: { 
                    reasoning: accumulatedReasoning,
                    newChunk: reasoning
                  }
                });
              }
            } catch (parseError) {
              console.warn('🚨 [WORKER] Parse error:', parseError, 'for line:', line);
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