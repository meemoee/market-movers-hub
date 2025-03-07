
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') || ''
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET') || ''
const REDIRECT_URI = 'https://lfmkoismabbhujycnqpn.functions.supabase.co/spotify-auth-callback'

console.log('Spotify API proxy initialized with:')
console.log('SPOTIFY_CLIENT_ID length:', SPOTIFY_CLIENT_ID.length)
console.log('SPOTIFY_CLIENT_SECRET length:', SPOTIFY_CLIENT_SECRET.length)

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }
  
  try {
    // Parse the request body
    const requestData = await req.json()
    console.log('Received request:', JSON.stringify(requestData, null, 2))
    
    const { 
      endpoint, 
      method = 'GET', 
      body = null,
      accessToken,
      refreshToken
    } = requestData
    
    if (!endpoint) {
      throw new Error('Missing endpoint parameter')
    }
    
    if (!accessToken) {
      throw new Error('Missing access token')
    }
    
    console.log(`Making ${method} request to Spotify API: ${endpoint}`)
    console.log('Authorization token length:', accessToken.length)
    
    // First try with the current access token
    let response = await fetchFromSpotify(endpoint, method, body, accessToken)
    console.log('Initial response status:', response.status)
    
    // If unauthorized (401), try refreshing the token and retry the request
    if (response.status === 401 && refreshToken) {
      console.log('Access token expired, refreshing token...')
      const refreshedTokens = await refreshAccessToken(refreshToken)
      
      if (!refreshedTokens.access_token) {
        console.error('Token refresh failed:', refreshedTokens)
        throw new Error('Failed to refresh access token: ' + JSON.stringify(refreshedTokens))
      }
      
      console.log('Token refreshed successfully, new token length:', refreshedTokens.access_token.length)
      
      // Retry the original request with the new access token
      response = await fetchFromSpotify(endpoint, method, body, refreshedTokens.access_token)
      console.log('Retry response status:', response.status)
      
      // Return both the API response and the new tokens
      const responseData = await parseResponse(response)
      return new Response(
        JSON.stringify({
          data: response.ok ? responseData : null,
          error: response.ok ? null : responseData,
          status: response.status,
          refreshedTokens: refreshedTokens
        }),
        { 
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: response.ok ? 200 : response.status
        }
      )
    }
    
    // Regular response (no token refresh needed)
    const responseData = await parseResponse(response)
    return new Response(
      JSON.stringify({
        data: response.ok ? responseData : null,
        error: response.ok ? null : responseData,
        status: response.status
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: response.ok ? 200 : response.status
      }
    )
  } catch (error) {
    console.error('Error in Spotify API proxy:', error)
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

// Helper function to parse response based on content
async function parseResponse(response: Response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch (e) {
      console.error('Failed to parse JSON response:', e)
      return await response.text()
    }
  } else {
    return await response.text()
  }
}

// Helper function to make requests to Spotify API
async function fetchFromSpotify(endpoint: string, method: string, body: any, accessToken: string) {
  const url = endpoint.startsWith('https://') 
    ? endpoint 
    : `https://api.spotify.com/v1/${endpoint}`
  
  console.log(`Calling Spotify API: ${method} ${url}`)
  console.log(`Using Authorization: Bearer ${accessToken.substring(0, 5)}...`)
  
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  }
  
  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body)
  }
  
  try {
    const response = await fetch(url, options)
    
    if (!response.ok) {
      console.error(`Spotify API error (${response.status}):`, await response.text().catch(() => 'Could not read error body'))
    }
    
    return response
  } catch (error) {
    console.error('Network error calling Spotify API:', error)
    throw error
  }
}

// Helper function to refresh the access token
async function refreshAccessToken(refreshToken: string) {
  console.log('Refreshing access token with refresh token...')
  
  // Create proper Base64 encoded authorization string
  const credentials = `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  const authString = btoa(credentials)
  
  // Set up token refresh parameters
  const tokenParams = new URLSearchParams()
  tokenParams.append('grant_type', 'refresh_token')
  tokenParams.append('refresh_token', refreshToken)
  
  console.log('Making token refresh request with authorization header')
  
  // Make the token refresh request
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authString}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: tokenParams.toString()
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Token refresh failed (${response.status}):`, errorText)
    throw new Error(`Failed to refresh token: ${errorText}`)
  }
  
  const tokenData = await response.json()
  return tokenData
}
