
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') || ''
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/spotify-auth-callback`

console.log('Function initialized with REDIRECT_URI:', REDIRECT_URI)
console.log('SPOTIFY_CLIENT_ID length:', SPOTIFY_CLIENT_ID.length)
console.log('SPOTIFY_CLIENT_SECRET length:', SPOTIFY_CLIENT_SECRET ? SPOTIFY_CLIENT_SECRET.length : 0)

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    })
  }

  // Get the authorization code from the URL query parameters
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  
  console.log('Received callback with code:', code?.substring(0, 10) + '...')
  
  if (error) {
    console.error('Error during Spotify authorization:', error)
    return new Response(
      `<html>
        <head>
          <title>Spotify Authentication Failed</title>
          <script>
            window.onload = function() {
              window.opener.postMessage({ type: 'spotify-auth-error', error: '${error}' }, '*');
              window.close();
            }
          </script>
        </head>
        <body>
          <p>Authentication failed. This window will close automatically.</p>
        </body>
      </html>`,
      { 
        headers: { ...corsHeaders, 'Content-Type': 'text/html' },
        status: 400 
      }
    )
  }

  if (!code) {
    console.error('No authorization code received')
    return new Response(
      `<html>
        <head>
          <title>Spotify Authentication Failed</title>
          <script>
            window.onload = function() {
              window.opener.postMessage({ type: 'spotify-auth-error', error: 'No authorization code received' }, '*');
              window.close();
            }
          </script>
        </head>
        <body>
          <p>Authentication failed. This window will close automatically.</p>
        </body>
      </html>`,
      { 
        headers: { ...corsHeaders, 'Content-Type': 'text/html' },
        status: 400 
      }
    )
  }

  try {
    // Create Base64 encoded authorization string - fixing how we encode
    const credentials = `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`;
    const authString = btoa(credentials);
    
    console.log('Client credentials length:', credentials.length);
    console.log('Auth header length:', authString.length);
    console.log('Full auth header:', `Basic ${authString}`);

    // Exchange the authorization code for an access token
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI
    });
    
    console.log('Token params:', tokenParams.toString());
    
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    console.log('Token response status:', tokenResponse.status);
    console.log('Token response headers:', JSON.stringify(Object.fromEntries([...tokenResponse.headers])));
    
    const responseText = await tokenResponse.text();
    console.log('Token response body:', responseText);
    
    if (!tokenResponse.ok) {
      throw new Error(`Failed to exchange code for token: ${responseText}`);
    }

    // Parse the token data from the response text
    const tokenData = JSON.parse(responseText);
    console.log('Successfully received token data with access token length:', tokenData.access_token?.length || 0);
    
    // Get user profile from Spotify
    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      console.error('Profile fetch error:', errorText);
      throw new Error(`Failed to fetch Spotify profile: ${errorText}`);
    }

    const profileData = await profileResponse.json();
    console.log('Successfully fetched profile data for:', profileData.display_name);
    
    // Return success response with HTML that passes data to opener
    return new Response(
      `<html>
        <head>
          <title>Spotify Authentication Successful</title>
          <script>
            window.onload = function() {
              window.opener.postMessage({
                type: 'spotify-auth-success',
                tokens: ${JSON.stringify(tokenData)},
                profile: ${JSON.stringify(profileData)}
              }, '*');
              window.close();
            }
          </script>
        </head>
        <body>
          <p>Authentication successful! This window will close automatically.</p>
        </body>
      </html>`,
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'text/html'
        },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error during token exchange:', error.message);
    return new Response(
      `<html>
        <head>
          <title>Spotify Authentication Failed</title>
          <script>
            window.onload = function() {
              window.opener.postMessage({ 
                type: 'spotify-auth-error', 
                error: '${error.message.replace(/'/g, "\\'")}' 
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
        status: 500 
      }
    )
  }
})
