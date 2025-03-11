import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

interface RawOrderBookProps {
  clobTokenId?: string;
  isClosing?: boolean;
}

// Get the Supabase anon key from the client
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc";

// Different WebSocket URL formats to try
const WS_URL_FORMATS = [
  // Format with auth in headers (managed by the browser)
  (baseUrl: string, tokenId: string) => 
    `wss://${baseUrl}.functions.supabase.co/polymarket-ws?assetId=${tokenId}`,
    
  // Format with explicit protocol and auth
  (baseUrl: string, tokenId: string) => 
    `wss://${baseUrl}.functions.supabase.co/polymarket-ws?assetId=${tokenId}&protocol=websocket`,
    
  // Format with apikey in URL (fallback)
  (baseUrl: string, tokenId: string) => 
    `wss://${baseUrl}.functions.supabase.co/polymarket-ws?assetId=${tokenId}&apikey=${SUPABASE_ANON_KEY}`,
    
  // Direct HTTP fetch fallback
  (baseUrl: string, tokenId: string) => 
    `https://${baseUrl}.functions.supabase.co/polymarket-ws?assetId=${tokenId}&x-client-info=debug`,
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
  const directFetchTriedRef = useRef<boolean>(false);
  
  // Basic HTTP test to check Edge Function availability
  useEffect(() => {
    const testEndpoint = async () => {
      try {
        const baseUrl = "lfmkoismabbhujycnqpn";
        
        // Try multiple test approaches
        setRawData(prev => [...prev, `📋 DIAGNOSTIC MODE - TRYING MULTIPLE CONNECTION APPROACHES`]);
        
        // First approach: Using Supabase client for test mode
        try {
          setRawData(prev => [...prev, `🔍 TEST 1: Using Supabase client.functions.invoke('polymarket-ws')`]);
          
          const { data, error } = await supabase.functions.invoke('polymarket-ws', {
            method: 'GET',
            headers: { 
              'Content-Type': 'application/json',
              'x-client-info': 'test-mode',
            }
          });

          if (error) {
            setRawData(prev => [...prev, `❌ Test 1 failed: ${error.message}`]);
          } else {
            setRawData(prev => [...prev, `✅ Test 1 succeeded: ${JSON.stringify(data)}`]);
          }
        } catch (err) {
          setRawData(prev => [...prev, `❌ Test 1 exception: ${(err as Error).message}`]);
        }
        
        // Second approach: Direct fetch with API key in header
        try {
          const testUrl2 = `https://${baseUrl}.functions.supabase.co/polymarket-ws`;
          setRawData(prev => [...prev, `🔍 TEST 2: Direct fetch with API key in header: ${testUrl2}`]);
          
          const response2 = await fetch(testUrl2, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'x-client-info': 'test-mode',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
          });
          
          if (response2.ok) {
            const data2 = await response2.json();
            setRawData(prev => [...prev, `✅ Test 2 succeeded: ${JSON.stringify(data2)}`]);
          } else {
            setRawData(prev => [...prev, `❌ Test 2 failed: ${response2.status} ${response2.statusText}`]);
            const errorText = await response2.text();
            setRawData(prev => [...prev, `Response: ${errorText}`]);
          }
        } catch (err) {
          setRawData(prev => [...prev, `❌ Test 2 exception: ${(err as Error).message}`]);
        }
        
        // Third approach: Test CORS with OPTIONS
        try {
          const testUrl3 = `https://${baseUrl}.functions.supabase.co/polymarket-ws`;
          setRawData(prev => [...prev, `🔍 TEST 3: OPTIONS request to test CORS: ${testUrl3}`]);
          
          const response3 = await fetch(testUrl3, {
            method: 'OPTIONS',
            headers: {
              'x-client-info': 'test-mode',
              'apikey': SUPABASE_ANON_KEY,
              'Origin': window.location.origin
            }
          });
          
          if (response3.ok) {
            setRawData(prev => [...prev, `✅ Test 3 succeeded: ${response3.status} ${response3.statusText}`]);
            
            // Log CORS headers
            const corsHeaders = [
              'Access-Control-Allow-Origin',
              'Access-Control-Allow-Methods',
              'Access-Control-Allow-Headers'
            ];
            
            corsHeaders.forEach(header => {
              const value = response3.headers.get(header);
              setRawData(prev => [...prev, `CORS Header: ${header}: ${value || 'not present'}`]);
            });
          } else {
            setRawData(prev => [...prev, `❌ Test 3 failed: ${response3.status} ${response3.statusText}`]);
          }
        } catch (err) {
          setRawData(prev => [...prev, `❌ Test 3 exception: ${(err as Error).message}`]);
        }
        
        setRawData(prev => [...prev, `📋 DIAGNOSTIC TESTS COMPLETED - Now attempting WebSocket connection`]);
        
      } catch (err) {
        setRawData(prev => [...prev, `❌ Overall diagnostic failed: ${(err as Error).message}`]);
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
  
  // Try a direct HTTP fetch as a fallback
  const tryDirectFetch = async () => {
    if (directFetchTriedRef.current || !clobTokenId) return;
    
    directFetchTriedRef.current = true;
    setRawData(prev => [...prev, `🔍 Trying direct HTTP fetch as fallback...`]);
    
    try {
      const baseUrl = "lfmkoismabbhujycnqpn";
      const fetchUrl = `https://${baseUrl}.functions.supabase.co/polymarket-ws?assetId=${clobTokenId}`;
      
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRawData(prev => [...prev, `✅ Direct fetch succeeded: ${JSON.stringify(data)}`]);
        
        // Simulate some activity since WebSocket failed
        setInterval(() => {
          if (mountedRef.current) {
            setRawData(prev => {
              const newEntry = `SIMULATED: Periodic update at ${new Date().toISOString()}`;
              const newData = [...prev, newEntry];
              return newData.length > 50 ? newData.slice(-50) : newData;
            });
          }
        }, 5000);
      } else {
        setRawData(prev => [...prev, `❌ Direct fetch failed: ${response.status} ${response.statusText}`]);
      }
    } catch (err) {
      setRawData(prev => [...prev, `❌ Direct fetch error: ${(err as Error).message}`]);
    }
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
      
      // Check if this is a direct HTTP URL (our fallback)
      if (wsUrl.startsWith('http')) {
        tryDirectFetch();
        return;
      }
      
      try {
        // Create WebSocket with protocols explicitly specified
        const ws = new WebSocket(wsUrl, ['websocket']);
        wsRef.current = ws;
        
        // Log connection attempt
        setRawData(prev => [...prev, `🔌 Attempting connection with format #${urlFormatIndex + 1}: ${wsUrl}`]);
        
        // Set connection timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = window.setTimeout(() => {
          if (status === "connecting" && ws.readyState !== WebSocket.OPEN) {
            setRawData(prev => [...prev, `⏱️ Connection timeout after 15 seconds`]);
            setError("Connection timeout - trying next format");
            ws.close();
            
            // Try next format on timeout
            urlFormatIndexRef.current += 1;
            
            // If we've tried all formats, consider fallback to HTTP
            if (urlFormatIndexRef.current >= WS_URL_FORMATS.length) {
              tryDirectFetch();
            }
            
            timeoutRef.current = window.setTimeout(() => {
              if (mountedRef.current && !isClosing && reconnectAttemptRef.current < 10) {
                connectWebSocket();
              } else if (reconnectAttemptRef.current >= 10) {
                setRawData(prev => [...prev, `⚠️ Maximum reconnection attempts reached (${reconnectAttemptRef.current})`]);
                
                // Try fallback HTTP method
                tryDirectFetch();
                
                // Show a toast notification
                toast({
                  title: "WebSocket Connection Failed",
                  description: "Could not establish a WebSocket connection after multiple attempts. Using fallback mode.",
                  variant: "destructive"
                });
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
            
            // Show toast notification
            toast({
              title: "WebSocket Connected",
              description: "Successfully established WebSocket connection.",
              variant: "default"
            });
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
              
              // If we've tried all formats without success, try HTTP fallback
              if (urlFormatIndexRef.current >= WS_URL_FORMATS.length && !directFetchTriedRef.current) {
                tryDirectFetch();
              }
              
              timeoutRef.current = window.setTimeout(() => {
                if (mountedRef.current && !isClosing && reconnectAttemptRef.current < 10) {
                  connectWebSocket();
                } else if (reconnectAttemptRef.current >= 10) {
                  setRawData(prev => [...prev, `⚠️ Maximum reconnection attempts reached (${reconnectAttemptRef.current})`]);
                  
                  // Show toast notification about failure
                  toast({
                    title: "WebSocket Reconnection Failed",
                    description: "Could not reconnect after multiple attempts.",
                    variant: "destructive"
                  });
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
        
        // If we've tried all formats without success, try HTTP fallback
        if (urlFormatIndexRef.current >= WS_URL_FORMATS.length && !directFetchTriedRef.current) {
          tryDirectFetch();
        }
        
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
  }, [clobTokenId, isClosing]);

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
      directFetchTriedRef.current = false;
      
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
      setRawData(prev => [...prev, `⏱️ Manual reconnect at: ${new Date().toISOString()}`]);
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
            
            {/* Add test connection button to try HTTP fallback */}
            <button 
              onClick={() => tryDirectFetch()}
              className="px-2 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 rounded-md text-xs"
            >
              HTTP Test
            </button>
            
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
