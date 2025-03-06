
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') || ''
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/spotify-auth-callback`

console.log('Callback function initialized with:')
console.log('SPOTIFY_CLIENT_ID length:', SPOTIFY_CLIENT_ID.length)
console.log('SPOTIFY_CLIENT_SECRET length:', SPOTIFY_CLIENT_SECRET.length)
console.log('REDIRECT_URI:', REDIRECT_URI)

serve(async (req) => {
  console.log('Received callback request')
  
  // Always set CORS headers for browser preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  // Get the authorization code from the URL query parameters
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  
  console.log('Auth code received:', code ? 'yes' : 'no')
  console.log('Error received:', error || 'none')
  
  if (error || !code) {
    console.error('Error or missing code:', error || 'No code received')
    return new Response(
      `<html>
        <head>
          <title>Spotify Authentication Failed</title>
          <script>
            window.onload = function() {
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
    console.log('Starting token exchange...')
    
    // Create proper Base64 encoded authorization string
    const credentials = `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
    const authString = btoa(credentials)
    
    console.log('Authorization header prepared')
    
    // Set up token exchange parameters
    const tokenParams = new URLSearchParams()
    tokenParams.append('grant_type', 'authorization_code')
    tokenParams.append('code', code)
    tokenParams.append('redirect_uri', REDIRECT_URI)
    
    console.log('Token request parameters prepared')
    
    // Make the token exchange request
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: tokenParams.toString()
    })

    console.log('Token response received:', tokenResponse.status)
    
    const responseText = await tokenResponse.text()
    console.log('Token response body:', responseText)
    
    if (!tokenResponse.ok) {
      throw new Error(`Failed to exchange code for token: ${responseText}`)
    }

    const tokenData = JSON.parse(responseText)
    console.log('Token data parsed successfully')
    
    // Get user profile from Spotify
    console.log('Fetching user profile...')
    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    })

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text()
      throw new Error(`Failed to fetch Spotify profile: ${errorText}`)
    }

    const profileData = await profileResponse.json()
    console.log('Profile data fetched successfully for:', profileData.display_name)
    
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
    console.error('Error during token exchange:', error)
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
