
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') || ''
// Use the exact static redirect URI that matches what's registered in Spotify
const REDIRECT_URI = 'https://lfmkoismabbhujycnqpn.functions.supabase.co/spotify-auth-callback'

console.log('Auth function initialized with:')
console.log('SPOTIFY_CLIENT_ID length:', SPOTIFY_CLIENT_ID.length)
console.log('REDIRECT_URI:', REDIRECT_URI)

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
    
    console.log('Generated auth URL with redirect URI:', REDIRECT_URI)
    console.log('Full auth URL (partial):', authUrl.toString().substring(0, 100) + '...')
    
    return new Response(
      JSON.stringify({ url: authUrl.toString() }),
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
