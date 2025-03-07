
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') || ''
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET') || ''
// Use the exact static redirect URI that matches what's registered in Spotify
const REDIRECT_URI = 'https://lfmkoismabbhujycnqpn.functions.supabase.co/spotify-auth-callback'

console.log('---------- CALLBACK FUNCTION INITIALIZED ----------')
console.log('SPOTIFY_CLIENT_ID length:', SPOTIFY_CLIENT_ID.length)
console.log('SPOTIFY_CLIENT_SECRET length:', SPOTIFY_CLIENT_SECRET.length)
console.log('REDIRECT_URI:', REDIRECT_URI)
console.log('CORS headers:', corsHeaders)

serve(async (req) => {
  console.log('---------- CALLBACK REQUEST RECEIVED ----------')
  console.log('Request method:', req.method)
  console.log('Request URL:', req.url)
  
  // Always set CORS headers for browser preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request (CORS preflight)')
    return new Response(null, { 
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  // For GET requests directly from Spotify redirect
  const url = new URL(req.url)
  console.log('URL pathname:', url.pathname)
  console.log('URL search params:', Array.from(url.searchParams.entries()))
  
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const state = url.searchParams.get('state')
  
  console.log('Auth code received:', code ? `yes (${code.substring(0, 5)}...)` : 'no')
  console.log('Error received:', error || 'none')
  console.log('State received:', state || 'none')
  
  if (error || !code) {
    console.error('Error or missing code:', error || 'No code received')
    return new Response(
      `<html>
        <head>
          <title>Spotify Authentication Failed</title>
          <script>
            window.onload = function() {
              console.log("Auth failed, posting message to opener");
              window.opener.postMessage({ 
                type: 'spotify-auth-error', 
                error: '${error || 'No authorization code received'}' 
              }, '*');
              window.close();
            }
          </script>
        </head>
        <body>
          <p>Authentication failed. This window will close automatically.</p>
        </body>
      </html>`,
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'text/html'
        },
        status: 400 
      }
    )
  }

  try {
    console.log('Starting token exchange process...')
    
    // This is a page that will get the code_verifier from the opener window's localStorage
    // and pass it to the parent window to complete the PKCE flow
    const pkceExchangeHtml = `
      <html>
        <head>
          <title>Completing Authentication</title>
          <script>
            function getCodeVerifier() {
              try {
                // Try to get the code verifier from sessionStorage
                const codeVerifier = window.opener && window.opener.sessionStorage.getItem('spotify_code_verifier');
                console.log("Code verifier from sessionStorage:", codeVerifier ? "found" : "not found");
                
                if (!codeVerifier) {
                  throw new Error('Code verifier not found in session storage');
                }

                // Remove it from sessionStorage after using it
                window.opener.sessionStorage.removeItem('spotify_code_verifier');
                return codeVerifier;
              } catch (err) {
                console.error('Error accessing code verifier:', err);
                return null;
              }
            }

            window.onload = async function() {
              try {
                console.log("Callback page loaded, getting code verifier");
                const codeVerifier = getCodeVerifier();
                if (!codeVerifier) {
                  throw new Error('Could not retrieve code verifier');
                }
                
                console.log("Got code verifier, sending to server for token exchange");
                // Pass only the authorization code, not the full URL
                const response = await fetch('${REDIRECT_URI}', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    code: '${code}',
                    code_verifier: codeVerifier
                  })
                });
                
                if (!response.ok) {
                  const errorText = await response.text();
                  throw new Error(\`Token exchange failed: \${errorText}\`);
                }
                
                const data = await response.json();
                console.log("Token exchange successful, posting message to opener");
                // Post message to opener window with the results
                window.opener.postMessage(data, '*');
              } catch (error) {
                console.error('Error during token exchange:', error);
                window.opener.postMessage({ 
                  type: 'spotify-auth-error', 
                  error: error.message 
                }, '*');
              } finally {
                // Close the popup window
                window.close();
              }
            }
          </script>
        </head>
        <body>
          <p>Completing authentication. This window will close automatically.</p>
          <p>If this window doesn't close, please check the console for errors and close it manually.</p>
        </body>
      </html>
    `;

    // For GET requests, return the HTML that will execute the client-side code
    if (req.method === 'GET') {
      console.log('Handling GET request, sending PKCE exchange HTML')
      return new Response(
        pkceExchangeHtml,
        { 
          headers: { 
            ...corsHeaders,
            'Content-Type': 'text/html'
          },
          status: 200 
        }
      );
    }

    // For POST requests, handle the token exchange server-side
    if (req.method === 'POST') {
      console.log('Handling POST request for token exchange')
      
      let requestBody;
      try {
        requestBody = await req.json();
        console.log('Parsed request body successfully')
        console.log('Request body keys:', Object.keys(requestBody))
      } catch (e) {
        console.error('Failed to parse request body:', e)
        throw new Error(`Invalid request body: ${e.message}`)
      }
      
      const codeVerifier = requestBody.code_verifier;
      
      console.log('Code verifier received from client:', codeVerifier ? `yes (${codeVerifier.substring(0, 5)}...)` : 'no');
      
      if (!codeVerifier) {
        console.error('Missing code_verifier in request')
        throw new Error('Missing code_verifier in request');
      }
      
      // Set up token exchange parameters
      const tokenParams = new URLSearchParams();
      tokenParams.append('grant_type', 'authorization_code');
      tokenParams.append('code', code);
      tokenParams.append('redirect_uri', REDIRECT_URI);
      tokenParams.append('client_id', SPOTIFY_CLIENT_ID);
      tokenParams.append('code_verifier', codeVerifier);
      
      console.log('Token request with PKCE prepared')
      console.log('Using code:', code.substring(0, 10) + '...')
      console.log('Using code verifier:', codeVerifier.substring(0, 10) + '...')
      console.log('Using client ID:', SPOTIFY_CLIENT_ID.substring(0, 5) + '...')
      console.log('Using redirect URI:', REDIRECT_URI)
      
      // Create Basic Auth header with client credentials
      const credentials = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
      const authHeader = `Basic ${credentials}`;
      
      console.log('Created Basic Auth header with client credentials')
      console.log('Making token request to Spotify API')
      
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': authHeader,
          'Accept': 'application/json'
        },
        body: tokenParams.toString()
      });

      console.log('Token response status:', tokenResponse.status);
      
      const responseText = await tokenResponse.text();
      console.log('Token response body (first 50 chars):', responseText.substring(0, 50) + '...');
      
      if (!tokenResponse.ok) {
        console.error(`Failed to exchange code for token: ${responseText}`);
        throw new Error(`Failed to exchange code for token: ${responseText}`);
      }

      let tokenData;
      try {
        tokenData = JSON.parse(responseText);
        console.log('Token data parsed successfully, access token received:', !!tokenData.access_token);
      } catch (e) {
        console.error('Failed to parse token response:', e);
        throw new Error(`Failed to parse token response: ${e.message}`);
      }
      
      // Get user profile from Spotify
      console.log('Fetching user profile with access token...');
      const profileResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      });

      const profileResponseStatus = profileResponse.status;
      console.log('Profile response status:', profileResponseStatus);
      
      if (!profileResponse.ok) {
        const errorText = await profileResponse.text();
        console.error('Profile fetch error response:', errorText);
        throw new Error(`Failed to fetch Spotify profile: ${errorText}`);
      }

      let profileData;
      try {
        profileData = await profileResponse.json();
        console.log('Profile data fetched successfully for:', profileData.display_name);
      } catch (e) {
        console.error('Failed to parse profile response:', e);
        throw new Error(`Failed to parse profile response: ${e.message}`);
      }
      
      return new Response(
        JSON.stringify({
          type: 'spotify-auth-success',
          tokens: tokenData,
          profile: profileData
        }),
        { 
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 200 
        }
      );
    }
    
    // If neither GET nor POST, return method not allowed
    console.error('Unsupported method:', req.method)
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 405 
      }
    );
  } catch (error) {
    console.error('Error during token exchange:', error);
    return new Response(
      JSON.stringify({ 
        type: 'spotify-auth-error', 
        error: error.message 
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500 
      }
    );
  }
});
