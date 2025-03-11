
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': '*',
};

export const wsHeaders = {
  ...corsHeaders,
  'Upgrade': 'websocket',
  'Connection': 'Upgrade',
  'Sec-WebSocket-Version': '13',
  'Sec-WebSocket-Protocol': 'websocket'
};

