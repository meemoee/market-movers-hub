
import { Send, Zap, TrendingUp, DollarSign, Music } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from "@/integrations/supabase/client"
import ReactMarkdown from 'react-markdown'
import { Button } from './ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Alert, AlertTitle, AlertDescription } from './ui/alert'

export default function RightSidebar() {
  const [chatMessage, setChatMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [currentTab, setCurrentTab] = useState('chat')
  const [spotifyProfile, setSpotifyProfile] = useState<SpotifyProfile | null>(null)
  const [spotifyTokens, setSpotifyTokens] = useState<SpotifyTokens | null>(null)
  const [spotifyAuthError, setSpotifyAuthError] = useState<string | null>(null)
  const [userPlaylists, setUserPlaylists] = useState<any[]>([])
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  interface Message {
    type: 'user' | 'assistant'
    content?: string
  }

  interface SpotifyTokens {
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
  }

  interface SpotifyProfile {
    id: string
    display_name: string
    email: string
    images: { url: string }[]
    external_urls: { spotify: string }
  }

  // Function to call Spotify API through our proxy
  const callSpotifyAPI = useCallback(async (
    endpoint: string, 
    method: string = 'GET', 
    body: any = null
  ) => {
    if (!spotifyTokens) {
      console.error('No Spotify tokens available')
      return { error: 'Not authenticated with Spotify' }
    }

    try {
      console.log(`Calling Spotify API (${method}): ${endpoint}`)
      
      const { data, error, status, refreshedTokens } = await supabase.functions.invoke('spotify-api', {
        body: {
          endpoint,
          method,
          body,
          accessToken: spotifyTokens.access_token,
          refreshToken: spotifyTokens.refresh_token
        }
      })

      console.log('API response status:', status)
      
      // If we got refreshed tokens, update them
      if (refreshedTokens) {
        console.log('Updating tokens with refreshed values')
        setSpotifyTokens(refreshedTokens)
        localStorage.setItem('spotify_tokens', JSON.stringify(refreshedTokens))
      }

      if (error) {
        console.error('Spotify API error:', error)
        return { error, status }
      }

      return { data, status }
    } catch (err) {
      console.error('Error calling Spotify API:', err)
      return { error: err.message, status: 500 }
    }
  }, [spotifyTokens])

  // Load user playlists when authenticated
  const loadUserPlaylists = useCallback(async () => {
    if (!spotifyTokens) return
    
    setIsLoadingPlaylists(true)
    
    try {
      const { data, error } = await callSpotifyAPI('me/playlists?limit=10')
      
      if (error) {
        console.error('Error fetching playlists:', error)
        return
      }
      
      if (data?.items) {
        console.log('Loaded playlists:', data.items.length)
        setUserPlaylists(data.items)
      }
    } catch (err) {
      console.error('Error in loadUserPlaylists:', err)
    } finally {
      setIsLoadingPlaylists(false)
    }
  }, [callSpotifyAPI, spotifyTokens])

  useEffect(() => {
    // Load Spotify profile from localStorage on mount
    const savedTokens = localStorage.getItem('spotify_tokens')
    const savedProfile = localStorage.getItem('spotify_profile')
    
    if (savedTokens) {
      setSpotifyTokens(JSON.parse(savedTokens))
    }
    
    if (savedProfile) {
      setSpotifyProfile(JSON.parse(savedProfile))
    }

    // Set up event listener for Spotify auth callback
    const handleAuthMessage = (event: MessageEvent) => {
      console.log('Received postMessage event:', event.data)
      
      if (event.data.type === 'spotify-auth-success') {
        console.log('Auth success - tokens received:', !!event.data.tokens)
        console.log('Auth success - profile received:', !!event.data.profile)
        
        setSpotifyTokens(event.data.tokens)
        setSpotifyProfile(event.data.profile)
        setSpotifyAuthError(null)
        
        // Save to localStorage
        localStorage.setItem('spotify_tokens', JSON.stringify(event.data.tokens))
        localStorage.setItem('spotify_profile', JSON.stringify(event.data.profile))
      } else if (event.data.type === 'spotify-auth-error') {
        console.error('Auth error:', event.data.error)
        setSpotifyAuthError(event.data.error)
      }
    }

    window.addEventListener('message', handleAuthMessage)
    
    return () => {
      window.removeEventListener('message', handleAuthMessage)
    }
  }, [])

  // Load playlists when user gets authenticated
  useEffect(() => {
    if (spotifyProfile && spotifyTokens) {
      loadUserPlaylists()
    }
  }, [spotifyProfile, spotifyTokens, loadUserPlaylists])

  const handleChatMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return
    
    setHasStartedChat(true)
    setIsLoading(true)
    setMessages(prev => [...prev, { type: 'user', content: userMessage }])
    setChatMessage('')
    
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      abortControllerRef.current = new AbortController()

      console.log('Sending request to market-analysis function...')
      const { data, error } = await supabase.functions.invoke('market-analysis', {
        body: {
          message: userMessage,
          chatHistory: messages.map(m => `${m.type}: ${m.content}`).join('\n')
        }
      })

      if (error) {
        console.error('Supabase function error:', error)
        throw error
      }

      console.log('Received response from market-analysis:', data)
      
      let accumulatedContent = ''
      
      const stream = new ReadableStream({
        start(controller) {
          const textDecoder = new TextDecoder()
          const reader = new Response(data.body).body?.getReader()
          
          function push() {
            reader?.read().then(({done, value}) => {
              if (done) {
                console.log('Stream complete')
                controller.close()
                return
              }
              
              const chunk = textDecoder.decode(value)
              
              const lines = chunk.split('\n').filter(line => line.trim())
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim()
                  
                  if (jsonStr === '[DONE]') continue
                  
                  try {
                    const parsed = JSON.parse(jsonStr)
                    
                    const content = parsed.choices?.[0]?.delta?.content
                    if (content) {
                      accumulatedContent += content
                      setStreamingContent(accumulatedContent)
                    }
                  } catch (e) {
                    console.error('Error parsing SSE data:', e, 'Raw data:', jsonStr)
                  }
                }
              }
              
              push()
            })
          }
          
          push()
        }
      })

      const reader = stream.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }

      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: accumulatedContent 
      }])

    } catch (error) {
      console.error('Error in chat:', error)
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: 'Sorry, I encountered an error processing your request.' 
      }])
    } finally {
      setIsLoading(false)
      setStreamingContent('')
      abortControllerRef.current = null
    }
  }

  const handleConnectSpotify = async () => {
    try {
      console.log('Initiating Spotify auth flow...')
      const { data, error } = await supabase.functions.invoke('spotify-auth')
      
      if (error) {
        console.error('Error starting Spotify auth:', error)
        setSpotifyAuthError(error.message)
        return
      }
      
      if (data?.url) {
        console.log('Opening auth window with URL:', data.url.substring(0, 100) + '...')
        
        // Open a popup window for Spotify auth
        const width = 500
        const height = 700
        const left = window.screen.width / 2 - width / 2
        const top = window.screen.height / 2 - height / 2
        
        window.open(
          data.url,
          'Spotify Authentication',
          `width=${width},height=${height},left=${left},top=${top}`
        )
      }
    } catch (error) {
      console.error('Error connecting to Spotify:', error)
      setSpotifyAuthError(error.message)
    }
  }

  const handleDisconnectSpotify = () => {
    setSpotifyProfile(null)
    setSpotifyTokens(null)
    setUserPlaylists([])
    localStorage.removeItem('spotify_profile')
    localStorage.removeItem('spotify_tokens')
  }

  const defaultContent = [
    {
      icon: Zap,
      question: "Turn your 💬 into 💰",
      answer: "Hunchex will find market positions that correspond to the comments you make, allowing you to track their truthfulness over time.",
      subPoints: [
        { icon: TrendingUp, text: "Track price changes in real-time" },
        { icon: DollarSign, text: "Identify profitable opportunities" }
      ]
    },
    {
      icon: TrendingUp,
      question: "Your ability to predict depends on the data you have access to.",
      answer: "Hunchex lets you buy and sell your unique market insights, so you can make a living from telling the truth.",
      subPoints: [
        { icon: Zap, text: "Filter by time intervals" },
        { icon: DollarSign, text: "Sort by price movement %" }
      ]
    },
    {
      icon: DollarSign,
      question: "Data ownership. For real.",
      answer: "Sell your data to those who need it to understand the future. ",
      subPoints: [
        { icon: TrendingUp, text: "Login to your account" },
        { icon: Zap, text: "Select a market and place orders" }
      ]
    }
  ]

  return (
    <aside className="fixed top-0 right-0 h-screen w-[400px] bg-[#1a1b1e]/70 backdrop-blur-md z-[999] border-l border-white/10 hidden xl:block">
      <div className="p-6 overflow-y-auto h-full">
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="spotify">Spotify</TabsTrigger>
          </TabsList>
          
          <TabsContent value="chat" className="w-full">
            {!hasStartedChat ? (
              <>
                <div className="mb-16">
                  <h2 className="text-3xl font-extrabold whitespace-nowrap overflow-hidden text-ellipsis mb-1">
                    A New Kind of Market
                  </h2>
                  <h2 className="text-3xl font-extrabold whitespace-nowrap overflow-hidden text-ellipsis bg-gradient-to-r from-[#7E69AB] via-[#9b87f5] to-[#D946EF] text-transparent bg-clip-text">
                    For a New Age
                  </h2>
                </div>
                {defaultContent.map((item, index) => (
                  <div key={index} className="mb-6 pb-6 border-b border-white/10 last:border-0">
                    <div className="flex items-center mb-2">
                      <span className="mr-3 text-blue-500">
                        <item.icon size={16} />
                      </span>
                      <h3 className="text-sm font-semibold">{item.question}</h3>
                    </div>
                    <p className="text-gray-400 text-sm ml-9 mb-2">{item.answer}</p>
                    <div className="space-y-1 ml-9">
                      {item.subPoints.map((subPoint, subIndex) => (
                        <div key={subIndex} className="flex items-center">
                          <span className="mr-2 text-blue-500">
                            <subPoint.icon size={12} />
                          </span>
                          <span className="text-xs text-gray-400">{subPoint.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="space-y-4 mb-20">
                {messages.map((message, index) => (
                  <div key={index} className="bg-[#2c2e33] p-3 rounded-lg">
                    {message.type === 'user' ? (
                      <p className="text-white text-sm">{message.content}</p>
                    ) : (
                      <ReactMarkdown className="text-white text-sm prose prose-invert prose-sm max-w-none">
                        {message.content || ''}
                      </ReactMarkdown>
                    )}
                  </div>
                ))}
                {streamingContent && (
                  <div className="bg-[#2c2e33] p-3 rounded-lg">
                    <ReactMarkdown className="text-white text-sm prose prose-invert prose-sm max-w-none">
                      {streamingContent}
                    </ReactMarkdown>
                  </div>
                )}
                {isLoading && !streamingContent && (
                  <div className="bg-[#2c2e33] p-3 rounded-lg">
                    <p className="text-white text-sm">Thinking...</p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="spotify" className="w-full">
            <div className="mb-4">
              <h2 className="text-2xl font-bold mb-2">Spotify Connection</h2>
              <p className="text-gray-400 mb-4">Connect your Spotify account to enable music features</p>
              
              {spotifyAuthError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTitle>Authentication Error</AlertTitle>
                  <AlertDescription>{spotifyAuthError}</AlertDescription>
                </Alert>
              )}

              {spotifyProfile ? (
                <div className="bg-[#2c2e33] p-4 rounded-lg mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    {spotifyProfile.images?.[0]?.url && (
                      <img 
                        src={spotifyProfile.images[0].url} 
                        alt={spotifyProfile.display_name} 
                        className="w-12 h-12 rounded-full"
                      />
                    )}
                    <div>
                      <p className="font-medium">{spotifyProfile.display_name}</p>
                      <p className="text-sm text-gray-400">{spotifyProfile.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open(spotifyProfile.external_urls.spotify, '_blank')}
                    >
                      View Profile
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleDisconnectSpotify}
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
              ) : (
                <Button 
                  onClick={handleConnectSpotify} 
                  className="bg-[#1DB954] hover:bg-[#1DB954]/90 text-white"
                >
                  <Music className="mr-2 h-4 w-4" />
                  Connect Spotify
                </Button>
              )}
              
              {spotifyProfile && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-2">Your Playlists</h3>
                  {isLoadingPlaylists ? (
                    <p className="text-gray-400 text-sm">Loading playlists...</p>
                  ) : userPlaylists.length > 0 ? (
                    <div className="space-y-2 mt-3">
                      {userPlaylists.map(playlist => (
                        <div key={playlist.id} className="bg-[#2c2e33] p-3 rounded-lg flex items-center gap-3">
                          {playlist.images?.[0]?.url ? (
                            <img 
                              src={playlist.images[0].url} 
                              alt={playlist.name} 
                              className="w-10 h-10 rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-700 flex items-center justify-center rounded">
                              <Music size={18} />
                            </div>
                          )}
                          <div className="overflow-hidden">
                            <p className="font-medium truncate">{playlist.name}</p>
                            <p className="text-xs text-gray-400">{playlist.tracks.total} tracks</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">No playlists found</p>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="fixed bottom-0 right-0 w-[400px] p-4">
          {currentTab === 'chat' && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleChatMessage(chatMessage)
                  }
                }}
                placeholder="What do you believe?"
                className="flex-grow p-2 bg-[#2c2e33] border border-[#4a4b50] rounded-lg text-white text-sm"
              />
              <button 
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-blue-500"
                onClick={() => handleChatMessage(chatMessage)}
                disabled={isLoading}
              >
                <Send size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
