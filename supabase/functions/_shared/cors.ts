
// Enhanced CORS headers with multiple methods and longer cache
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Special headers for SSE connections
export const sseHeaders = {
  ...corsHeaders,
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

// Helper to create standard JSON responses with CORS
export function createJsonResponse(data: any, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

// Helper to create error responses with CORS
export function createErrorResponse(message: string, status = 400) {
  return createJsonResponse({ error: message }, status);
}

// Helper to handle CORS preflight requests
export function handleCorsPreflightRequest() {
  return new Response(null, { headers: corsHeaders });
}

// Helper to create SSE responses with proper headers
export function createSseResponse(stream: ReadableStream) {
  return new Response(stream, { headers: sseHeaders });
}
