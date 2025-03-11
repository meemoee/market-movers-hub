
import { useEffect, useState, useRef } from 'react';
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface RawOrderBookProps {
  clobTokenId?: string;
  isClosing?: boolean;
}

// Get the Supabase anon key from the client
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc";

export function RawOrderBookData({ clobTokenId, isClosing }: RawOrderBookProps) {
  const [status, setStatus] = useState<string>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef<boolean>(true);
  
  // Basic HTTP test to check Edge Function availability
  useEffect(() => {
    const testEndpoint = async () => {
      try {
        const baseUrl = "https://lfmkoismabbhujycnqpn.functions.supabase.co/polymarket-ws";
        setRawData(prev => [...prev, `Testing connection to: ${baseUrl}?test=true`]);
        
        // Use the Supabase client to make the test request
        const { data, error } = await supabase.functions.invoke('polymarket-ws', {
          method: 'GET',
          query: { test: 'true' }
        });

        if (error) {
          setRawData(prev => [...prev, `❌ Edge Function error: ${error.message}`]);
          setError(`Edge Function error: ${error.message}`);
          return;
        }
        
        setRawData(prev => [...prev, `✅ Edge Function response: ${JSON.stringify(data)}`]);
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
    };
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    // Skip if closing or no tokenId
    if (isClosing || !clobTokenId) {
      return;
    }

    // Clear existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Reset state
    setStatus("connecting");
    setError(null);
    
    // Get WebSocket URL with the asset ID
    const wsUrl = `wss://lfmkoismabbhujycnqpn.functions.supabase.co/polymarket-ws?assetId=${clobTokenId}`;
    setRawData(prev => [...prev, `Attempting to connect to: ${wsUrl}`]);
    
    try {
      // Simple WebSocket connection - no need for protocol or custom headers
      const ws = new WebSocket(wsUrl);
      
      wsRef.current = ws;
      
      // Connection opened
      ws.onopen = () => {
        if (mountedRef.current) {
          setStatus("connected");
          setError(null);
          setRawData(prev => [...prev, `✅ WebSocket connected successfully`]);
          
          // Send a ping message immediately after connection
          try {
            const pingData = JSON.stringify({ 
              ping: Date.now(),
              assetId: clobTokenId 
            });
            ws.send(pingData);
            setRawData(prev => [...prev, `SENT: ${pingData}`]);
          } catch (err) {
            setRawData(prev => [...prev, `❌ Error sending ping: ${(err as Error).message}`]);
          }
        }
      };

      // Handle messages
      ws.onmessage = (event) => {
        if (mountedRef.current) {
          setRawData(prev => {
            const newData = [...prev, `RECEIVED: ${event.data}`];
            return newData.length > 50 ? newData.slice(-50) : newData;
          });
        }
      };

      // Handle errors
      ws.onerror = (event) => {
        if (mountedRef.current) {
          setStatus("error");
          setError("WebSocket error occurred");
          setRawData(prev => [...prev, `❌ WebSocket error occurred`]);
        }
      };

      // Handle close
      ws.onclose = (event) => {
        if (mountedRef.current) {
          setStatus("disconnected");
          setRawData(prev => [...prev, `WebSocket closed: code=${event.code}, reason=${event.reason || "No reason provided"}`]);
        }
      };
    } catch (err) {
      setError(`Failed to create WebSocket: ${(err as Error).message}`);
      setStatus("error");
      setRawData(prev => [...prev, `❌ Error creating WebSocket: ${(err as Error).message}`]);
    }
    
    // Cleanup
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clobTokenId, isClosing]);

  // Render loading state
  if (status === "connecting" && rawData.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Connecting to Polymarket...</span>
      </div>
    );
  }

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
          
          {status === "error" && (
            <button 
              onClick={() => {
                if (clobTokenId) {
                  setStatus("connecting");
                  setError(null);
                  
                  // Simple retry - just reset the connection
                  if (wsRef.current) {
                    wsRef.current.close();
                    wsRef.current = null;
                  }
                  
                  // Add a timestamp to force a new connection attempt
                  setRawData(prev => [...prev, `Retry attempt at: ${new Date().toISOString()}`]);
                }
              }}
              className="px-3 py-1 bg-primary/10 hover:bg-primary/20 rounded-md text-xs ml-2"
            >
              Retry
            </button>
          )}
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
