import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface RawOrderBookProps {
  clobTokenId?: string;
  isClosing?: boolean;
}

// Get the Supabase anon key from the client
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc";

// Different WebSocket URLs to try
const WS_URL_FORMATS = [
  // Standard format
  (baseUrl: string, tokenId: string) => 
    `wss://${baseUrl}/functions/v1/polymarket-ws?assetId=${tokenId}&apikey=${SUPABASE_ANON_KEY}`,
  
  // With protocol parameter
  (baseUrl: string, tokenId: string) => 
    `wss://${baseUrl}/functions/v1/polymarket-ws?assetId=${tokenId}&apikey=${SUPABASE_ANON_KEY}&protocol=ws`,
    
  // Direct function domain
  (baseUrl: string, tokenId: string) => 
    `wss://${baseUrl}.functions.supabase.co/polymarket-ws?assetId=${tokenId}&apikey=${SUPABASE_ANON_KEY}`,
    
  // Without apikey parameter
  (baseUrl: string, tokenId: string) => 
    `wss://${baseUrl}/functions/v1/polymarket-ws?assetId=${tokenId}`,
];

export function RawOrderBookData({ clobTokenId, isClosing }: RawOrderBookProps) {
  const [status, setStatus] = useState<string>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef<boolean>(true);
  const reconnectAttemptRef = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);
  const urlFormatIndexRef = useRef<number>(0);
  const heartbeatTimeoutRef = useRef<number | null>(null);
  const lastHeartbeatRef = useRef<number>(Date.now());
  
  // Basic HTTP test to check Edge Function availability
  useEffect(() => {
    const testEndpoint = async () => {
      try {
        const baseUrl = "lfmkoismabbhujycnqpn";
        const testUrl = `https://${baseUrl}.functions.supabase.co/polymarket-ws`;
        setRawData(prev => [...prev, `Testing connection to: ${testUrl}`]);
        
        // Call the edge function using the x-client-info header for test mode
        const { data, error } = await supabase.functions.invoke('polymarket-ws', {
          method: 'GET',
          headers: { 
            'Content-Type': 'application/json',
            'x-client-info': 'test-mode',
            'apikey': SUPABASE_ANON_KEY
          }
        });

        if (error) {
          setRawData(prev => [...prev, `❌ Edge Function error: ${error.message}`]);
          setError(`Edge Function error: ${error.message}`);
          return;
        }
        
        setRawData(prev => [...prev, `✅ Edge Function response: ${JSON.stringify(data)}`]);
        
        // Test a direct fetch to the function URL to check CORS
        try {
          const directResponse = await fetch(testUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'x-client-info': 'test-mode',
              'apikey': SUPABASE_ANON_KEY
            }
          });
          
          if (directResponse.ok) {
            const directData = await directResponse.json();
            setRawData(prev => [...prev, `✅ Direct fetch successful: ${JSON.stringify(directData)}`]);
          } else {
            setRawData(prev => [...prev, `❌ Direct fetch failed: ${directResponse.status} ${directResponse.statusText}`]);
          }
        } catch (fetchErr) {
          setRawData(prev => [...prev, `❌ Direct fetch error: ${(fetchErr as Error).message}`]);
        }
        
        setRawData(prev => [...prev, `✅ Edge Function is accessible`]);
      } catch (err) {
        setRawData(prev => [...prev, `❌ Could not access Edge Function: ${(err as Error).message}`]);
        setError(`Network error: ${(err as Error).message}`);
      }
    };
    
    if (clobTokenId && !isClosing) {
      testEndpoint();
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, [clobTokenId, isClosing]);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
      }
    };
  }, []);

  // Create heartbeat monitor function
  const setupHeartbeatMonitor = () => {
    // Clear any existing heartbeat monitor
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
    
    // Start new heartbeat monitor
    heartbeatTimeoutRef.current = window.setTimeout(() => {
      const timeSinceLastHeartbeat = Date.now() - lastHeartbeatRef.current;
      
      if (timeSinceLastHeartbeat > 20000 && wsRef.current?.readyState === WebSocket.OPEN) {
        setRawData(prev => [...prev, `⚠️ No heartbeat received for ${Math.round(timeSinceLastHeartbeat/1000)}s, sending ping`]);
        
        try {
          // Send a ping to check connection
          wsRef.current.send(JSON.stringify({
            type: "ping",
            timestamp: new Date().toISOString()
          }));
        } catch (err) {
          setRawData(prev => [...prev, `❌ Failed to send ping: ${(err as Error).message}`]);
          
          // Connection might be dead, try to reconnect
          if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
            setStatus("connecting");
            setError("Connection lost - reconnecting");
          }
        }
      }
      
      // Check again in 5 seconds
      setupHeartbeatMonitor();
    }, 5000);
  };

  // Connect to WebSocket
  useEffect(() => {
    // Skip if closing or no tokenId
    if (isClosing || !clobTokenId) {
      return;
    }

    // Function to establish WebSocket connection
    const connectWebSocket = () => {
      // Clear existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Reset state for this attempt
      setStatus("connecting");
      setError(null);
      reconnectAttemptRef.current += 1;
      
      // Use Supabase project ID without the full domain
      const baseProjectId = "lfmkoismabbhujycnqpn";
      
      // Try different URL formats if previous failed
      const urlFormatIndex = urlFormatIndexRef.current % WS_URL_FORMATS.length;
      const urlFormatter = WS_URL_FORMATS[urlFormatIndex];
      const wsUrl = urlFormatter(baseProjectId, clobTokenId);
      
      setRawData(prev => [...prev, `Connecting to WebSocket (attempt #${reconnectAttemptRef.current}, format #${urlFormatIndex + 1}): ${wsUrl}`]);
      
      try {
        // Create WebSocket with detailed logging
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        // Set connection timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = window.setTimeout(() => {
          if (status === "connecting" && ws.readyState !== WebSocket.OPEN) {
            setRawData(prev => [...prev, `Connection timeout after 15 seconds`]);
            setError("Connection timeout - trying next format");
            ws.close();
            
            // Try next format on timeout
            urlFormatIndexRef.current += 1;
            timeoutRef.current = window.setTimeout(() => {
              if (mountedRef.current && !isClosing) {
                connectWebSocket();
              }
            }, 1000);
          }
        }, 15000);
        
        // Connection opened
        ws.onopen = () => {
          if (mountedRef.current) {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            
            setStatus("connected");
            setError(null);
            setRawData(prev => [...prev, `✅ WebSocket connected successfully (format #${urlFormatIndex + 1})`]);
            
            // Update last heartbeat time
            lastHeartbeatRef.current = Date.now();
            
            // Setup heartbeat monitor
            setupHeartbeatMonitor();
            
            // Send a simple message to test the connection
            try {
              const pingData = JSON.stringify({ 
                type: "ping",
                assetId: clobTokenId,
                timestamp: new Date().toISOString()
              });
              ws.send(pingData);
              setRawData(prev => [...prev, `SENT: ${pingData}`]);
            } catch (err) {
              setRawData(prev => [...prev, `❌ Error sending message: ${(err as Error).message}`]);
            }
          }
        };

        // Handle messages
        ws.onmessage = (event) => {
          if (mountedRef.current) {
            // Update heartbeat timestamp on any message
            lastHeartbeatRef.current = Date.now();
            
            let messageDisplay = event.data;
            try {
              // Try to pretty print JSON
              const jsonData = JSON.parse(event.data);
              if (jsonData.type === "heartbeat") {
                // Just log heartbeats without adding to the visible log
                console.log(`Received heartbeat: ${event.data}`);
                return;
              }
              messageDisplay = JSON.stringify(jsonData, null, 2);
            } catch (e) {
              // Not JSON, use as is
            }
            
            setRawData(prev => {
              const newData = [...prev, `RECEIVED: ${messageDisplay}`];
              return newData.length > 50 ? newData.slice(-50) : newData;
            });
          }
        };

        // Handle errors
        ws.onerror = (event) => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          
          if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
          }
          
          if (mountedRef.current) {
            setStatus("error");
            setError("WebSocket error occurred");
            setRawData(prev => [...prev, `❌ WebSocket error occurred`]);
            console.error('WebSocket error:', event);
          }
        };

        // Handle close
        ws.onclose = (event) => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          
          if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
          }
          
          if (mountedRef.current) {
            setStatus("disconnected");
            
            // Log detailed close information
            setRawData(prev => {
              const closeInfo = `WebSocket closed: code=${event.code}, reason=${event.reason || "No reason provided"}`;
              let explanation = "";
              
              // Add explanation for common close codes
              switch (event.code) {
                case 1000:
                  explanation = " (Normal closure)";
                  break;
                case 1001:
                  explanation = " (Endpoint going away)";
                  break;
                case 1002:
                  explanation = " (Protocol error)";
                  break;
                case 1003:
                  explanation = " (Unsupported data)";
                  break;
                case 1005:
                  explanation = " (No status received)";
                  break;
                case 1006:
                  explanation = " (Abnormal closure - may indicate network issue or server timeout)";
                  break;
                case 1007:
                  explanation = " (Invalid frame payload data)";
                  break;
                case 1008:
                  explanation = " (Policy violation)";
                  break;
                case 1009:
                  explanation = " (Message too big)";
                  break;
                case 1010:
                  explanation = " (Mandatory extension)";
                  break;
                case 1011:
                  explanation = " (Internal server error)";
                  break;
                case 1012:
                  explanation = " (Service restart)";
                  break;
                case 1013:
                  explanation = " (Try again later)";
                  break;
                case 1014:
                  explanation = " (Bad gateway)";
                  break;
                case 1015:
                  explanation = " (TLS handshake)";
                  break;
                default:
                  explanation = "";
              }
              
              return [...prev, closeInfo + explanation];
            });
            
            // Try next format on closure if not a normal closure
            if (event.code !== 1000) {
              urlFormatIndexRef.current += 1;
              timeoutRef.current = window.setTimeout(() => {
                if (mountedRef.current && !isClosing && reconnectAttemptRef.current < 10) {
                  connectWebSocket();
                } else if (reconnectAttemptRef.current >= 10) {
                  setRawData(prev => [...prev, `⚠️ Maximum reconnection attempts reached (${reconnectAttemptRef.current})`]);
                }
              }, 2000);
            }
          }
        };
      } catch (err) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        setError(`Failed to create WebSocket: ${(err as Error).message}`);
        setStatus("error");
        setRawData(prev => [...prev, `❌ Error creating WebSocket: ${(err as Error).message}`]);
        
        // Try next format on error
        urlFormatIndexRef.current += 1;
        timeoutRef.current = window.setTimeout(() => {
          if (mountedRef.current && !isClosing && reconnectAttemptRef.current < 10) {
            connectWebSocket();
          } else if (reconnectAttemptRef.current >= 10) {
            setRawData(prev => [...prev, `⚠️ Maximum reconnection attempts reached (${reconnectAttemptRef.current})`]);
          }
        }, 2000);
      }
    };
    
    // Connect to WebSocket
    connectWebSocket();
    
    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clobTokenId, isClosing, status]);

  // Send a test message periodically to keep connection alive
  useEffect(() => {
    if (status !== "connected" || !wsRef.current || isClosing) {
      return;
    }
    
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          const keepAliveMsg = JSON.stringify({
            type: "keep_alive",
            timestamp: new Date().toISOString()
          });
          wsRef.current.send(keepAliveMsg);
          console.log("Sent keep-alive message");
        } catch (err) {
          console.error("Failed to send keep-alive message:", err);
          setRawData(prev => [...prev, `❌ Failed to send keep-alive: ${(err as Error).message}`]);
        }
      }
    }, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [status, isClosing]);

  // Render loading state
  if (status === "connecting" && rawData.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Connecting to Polymarket...</span>
      </div>
    );
  }

  // Function to manually reset connection and try a specific format
  const resetConnection = (formatIndex?: number) => {
    if (clobTokenId) {
      setStatus("connecting");
      setError(null);
      reconnectAttemptRef.current = 0;
      
      // Reset to the beginning or use specified format
      if (formatIndex !== undefined) {
        urlFormatIndexRef.current = formatIndex;
      } else {
        urlFormatIndexRef.current = 0;
      }
      
      // Close any existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      // Add a timestamp to force a new connection attempt
      setRawData(prev => [...prev, `Manual reconnect at: ${new Date().toISOString()}`]);
    }
  };

  // Render data display (both error and success states)
  return (
    <div className="h-[300px] overflow-y-auto bg-background/50 border border-border rounded-md p-2">
      <div className="text-xs font-mono">
        <div className="sticky top-0 bg-background/90 mb-2 py-1 border-b border-border">
          Status: <span className={
            status === "connected" ? "text-green-500" :
            status === "connecting" ? "text-yellow-500" :
            status === "error" ? "text-red-500" :
            "text-muted-foreground"
          }>{status}</span>
          {error && <span className="text-red-500 ml-2">Error: {error}</span>}
          
          <div className="flex flex-wrap gap-1 mt-1">
            {(status === "error" || status === "disconnected") && (
              <button 
                onClick={() => resetConnection()}
                className="px-2 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-xs"
              >
                Reconnect
              </button>
            )}
            
            {WS_URL_FORMATS.map((_, index) => (
              <button 
                key={index}
                onClick={() => resetConnection(index)}
                className={`px-2 py-1 rounded-md text-xs ${
                  urlFormatIndexRef.current % WS_URL_FORMATS.length === index 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted hover:bg-muted-foreground/20"
                }`}
              >
                Format #{index + 1}
              </button>
            ))}
          </div>
        </div>
        
        <div className="space-y-1 whitespace-pre-wrap break-all">
          {rawData.length === 0 ? (
            <div className="text-muted-foreground">Waiting for data...</div>
          ) : (
            rawData.map((data, index) => (
              <div key={index} className="border-b border-border/30 pb-1 mb-1 text-[11px]">
                {data}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
