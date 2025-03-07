
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') || ''
// Use the exact static redirect URI that matches what's registered in Spotify
const REDIRECT_URI = 'https://lfmkoismabbhujycnqpn.functions.supabase.co/spotify-auth-callback'

console.log('Auth function initialized with:')
console.log('SPOTIFY_CLIENT_ID length:', SPOTIFY_CLIENT_ID.length)
console.log('REDIRECT_URI:', REDIRECT_URI)

// Generate a random string for PKCE code_verifier
function generateRandomString(length: number) {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

// Hash the code verifier to create the code_challenge
async function generateCodeChallenge(codeVerifier: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      }
    })
  }

  try {
    console.log('Generating Spotify auth URL...')
    
    // Add state parameter for security
    const state = crypto.randomUUID()
    
    // Generate PKCE code verifier and challenge
    const codeVerifier = generateRandomString(128)
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    
    const scopes = [
      'user-read-private',
      'user-read-email',
      'user-top-read',
      'user-read-recently-played',
      'playlist-read-private'
    ]
    
    // Generate Spotify authorization URL with proper encoding
    const authUrl = new URL('https://accounts.spotify.com/authorize')
    authUrl.searchParams.append('client_id', SPOTIFY_CLIENT_ID)
    authUrl.searchParams.append('response_type', 'code')
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI)
    authUrl.searchParams.append('scope', scopes.join(' '))
    authUrl.searchParams.append('state', state)
    // Add PKCE parameters
    authUrl.searchParams.append('code_challenge_method', 'S256')
    authUrl.searchParams.append('code_challenge', codeChallenge)
    
    console.log('Generated auth URL with redirect URI:', REDIRECT_URI)
    console.log('Full auth URL (partial):', authUrl.toString().substring(0, 100) + '...')
    console.log('Using PKCE with code_challenge:', codeChallenge.substring(0, 10) + '...')
    console.log('Code verifier (for verification):', codeVerifier.substring(0, 10) + '...')
    
    return new Response(
      JSON.stringify({ 
        url: authUrl.toString(),
        codeVerifier: codeVerifier
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error generating Spotify auth URL:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500 
      }
    )
  }
})
