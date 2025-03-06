
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') || ''
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/spotify-auth-callback`

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

serve(async (req) => {
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
        headers: { 'Content-Type': 'text/html' },
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
        headers: { 'Content-Type': 'text/html' },
        status: 400 
      }
    )
  }

  try {
    // Create Base64 encoded authorization string
    const authString = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)
    console.log('Attempting token exchange with auth string:', authString.substring(0, 10) + '...')

    // Exchange the authorization code for an access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authString}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: REDIRECT_URI
      })
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('Error exchanging code for token:', errorData)
      throw new Error(`Failed to exchange code for token: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    console.log('Successfully received token data')
    
    // Get user profile from Spotify
    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    })

    if (!profileResponse.ok) {
      const errorData = await profileResponse.text()
      console.error('Error fetching Spotify profile:', errorData)
      throw new Error(`Failed to fetch Spotify profile: ${errorData}`)
    }

    const profileData = await profileResponse.json()
    console.log('Successfully fetched profile data')
    
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
        headers: { 'Content-Type': 'text/html' },
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
        headers: { 'Content-Type': 'text/html' },
        status: 500 
      }
    )
  }
})
