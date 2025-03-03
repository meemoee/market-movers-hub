
export async function streamProcessor(response, readable, writable) {
  const reader = response.body?.getReader();
  const writer = writable.getWriter();

  if (!reader) {
    await writer.close();
    return;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        
        if (line.trim() === 'data: [DONE]') {
          await writer.write(new TextEncoder().encode('data: [DONE]\n\n'));
          continue;
        }
        
        if (line.startsWith('data: ')) {
          await writer.write(new TextEncoder().encode(line + '\n\n'));
        }
      }
      
      // Flush after each chunk
      await writer.ready;
    }
  } catch (e) {
    console.error("Stream processing error:", e);
  } finally {
    await writer.close();
  }
}
