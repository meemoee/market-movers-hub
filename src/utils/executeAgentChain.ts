export interface Agent {
  id: string
  prompt: string
  model: string
  json_mode?: boolean
  json_schema?: unknown
}

interface AgentBlock {
  agentId: string
  prompt?: string
  copies: number
  routes?: number[]
  fieldRoutes?: Record<number, string[]>
}

interface Layer {
  agents: AgentBlock[]
}

export interface ChainConfig {
  layers: Layer[]
}

export interface AgentOutput {
  layer: number
  agentId: string
  output: string
}

export interface AgentStart {
  layer: number
  agentId: string
}

interface ExecutionContext {
  userId?: string
  marketId: string
  marketQuestion: string
  marketDescription?: string
  authToken: string
}

async function callModel(
  prompt: string,
  model: string,
  context: ExecutionContext,
  json_mode?: boolean,
  json_schema?: unknown
): Promise<string> {
  console.log('🧠 [callModel] Invoking model', model)
  console.log('🧠 [callModel] Prompt:', prompt)
  const res = await fetch(
    "https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/market-chat",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.authToken}`,
        apikey:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: prompt,
        chatHistory: [],
        userId: context.userId,
        marketId: context.marketId,
        marketQuestion: context.marketQuestion,
        marketDescription: context.marketDescription,
        selectedModel: model,
        jsonMode: json_mode,
        jsonSchema: json_schema,
      }),
    }
  )

  if (!res.ok) {
    console.log('⚠️ [callModel] Request failed:', res.status)
    return ""
  }

  type MarketChatResponse = { content?: string }
  const data: MarketChatResponse = await res.json().catch(() => ({} as MarketChatResponse))
  const content = data.content || ""
  console.log('✍️ [callModel] Parsed content:', content.trim())
  return content.trim()
}

export async function executeAgentChain(
  chainConfig: ChainConfig,
  agents: Agent[],
  initialInput: string,
  context: ExecutionContext,
  onAgentOutput?: (output: AgentOutput) => void,
  onAgentStart?: (info: AgentStart) => void
): Promise<{ prompt: string; model: string; outputs: AgentOutput[] }> {
  console.log('🚀 [executeAgentChain] Starting chain execution')
  console.log('🚀 [executeAgentChain] Chain config:', JSON.stringify(chainConfig, null, 2))
  console.log('🚀 [executeAgentChain] Initial input:', initialInput)
  if (!chainConfig.layers || chainConfig.layers.length === 0) {
    throw new Error("Chain has no layers")
  }

  let currentInputs: string[] = chainConfig.layers[0].agents.map(() => initialInput)
  const agentOutputs: AgentOutput[] = []

  for (let i = 0; i < chainConfig.layers.length - 1; i++) {
    const layer = chainConfig.layers[i]
    const nextLayer = chainConfig.layers[i + 1]
    const nextInputs: string[] = nextLayer.agents.map(() => "")

    console.log(`🔷 [executeAgentChain] Processing layer ${i + 1}`)
    console.log('🔷 [executeAgentChain] Current inputs:', currentInputs)

    for (let agentIndex = 0; agentIndex < layer.agents.length; agentIndex++) {
      const block = layer.agents[agentIndex]
      const agent = agents.find((a) => a.id === block.agentId)
      if (!agent) continue

      const basePrompt = block.prompt || agent.prompt
      const input = currentInputs[agentIndex] || ""

      console.log(`🤖 [executeAgentChain] Agent ${agent.id} (copy x${block.copies || 1})`)
      console.log('🤖 [executeAgentChain] Base prompt:', basePrompt)
      console.log('🤖 [executeAgentChain] Input:', input)
      console.log('🤖 [executeAgentChain] Routes:', block.routes)

      for (let c = 0; c < (block.copies || 1); c++) {
        onAgentStart?.({ layer: i, agentId: agent.id })
        console.log(`📡 [executeAgentChain] Calling model for agent ${agent.id}, copy ${c + 1}`)
        const output = await callModel(
          `${basePrompt}\n\n${input}`,
          agent.model,
          context,
          agent.json_mode,
          agent.json_schema
        )
        console.log(`📦 [executeAgentChain] Output from agent ${agent.id}:`, output)
        const agentOutput = { layer: i, agentId: agent.id, output }
        agentOutputs.push(agentOutput)
        onAgentOutput?.(agentOutput)

        let parsed: Record<string, unknown> | undefined
        if (agent.json_mode) {
          try {
            parsed = JSON.parse(output)
          } catch {
            parsed = undefined
          }
        }

        if (block.routes && block.routes.length > 0) {
          for (const target of block.routes) {
            let routedOutput = output
            const fields = block.fieldRoutes?.[target]
            if (agent.json_mode && parsed && fields && fields.length > 0) {
              const picked: Record<string, unknown> = {}
              for (const f of fields) {
                if (f in parsed) {
                  picked[f] = (parsed as Record<string, unknown>)[f]
                }
              }
              if (fields.length === 1) {
                const val = picked[fields[0]]
                routedOutput = typeof val === 'string' ? val : JSON.stringify(val)
              } else {
                routedOutput = JSON.stringify(picked)
              }
            }
            nextInputs[target] = [nextInputs[target], routedOutput].filter(Boolean).join("\n")
          }
        } else {
          for (let t = 0; t < nextInputs.length; t++) {
            nextInputs[t] = [nextInputs[t], output].filter(Boolean).join("\n")
          }
        }
        console.log('📬 [executeAgentChain] nextInputs after routing:', nextInputs)
      }
    }

    console.log(`🔁 [executeAgentChain] Completed layer ${i + 1}`)
    console.log('🔁 [executeAgentChain] Aggregated outputs for next layer:', nextInputs)
    currentInputs = nextInputs
  }
  const finalLayer = chainConfig.layers[chainConfig.layers.length - 1]

  // execute any additional agents in the final layer (beyond the first) so their
  // outputs are captured even though there is no subsequent layer
  if (finalLayer.agents.length > 1) {
    console.log('🏁 [executeAgentChain] Processing additional final layer agents')
    for (let agentIndex = 1; agentIndex < finalLayer.agents.length; agentIndex++) {
      const block = finalLayer.agents[agentIndex]
      const agent = agents.find((a) => a.id === block.agentId)
      if (!agent) continue

      const basePrompt = block.prompt || agent.prompt
      const input = currentInputs[agentIndex] || ""

      console.log(`🤖 [executeAgentChain] Final layer agent ${agent.id} (copy x${block.copies || 1})`)
      console.log('🤖 [executeAgentChain] Base prompt:', basePrompt)
      console.log('🤖 [executeAgentChain] Input:', input)

      for (let c = 0; c < (block.copies || 1); c++) {
        onAgentStart?.({ layer: chainConfig.layers.length - 1, agentId: agent.id })
        console.log(`📡 [executeAgentChain] Calling model for agent ${agent.id}, copy ${c + 1}`)
        const output = await callModel(
          `${basePrompt}\n\n${input}`,
          agent.model,
          context,
          agent.json_mode,
          agent.json_schema
        )
        console.log(`📦 [executeAgentChain] Output from agent ${agent.id}:`, output)
        const agentOutput = {
          layer: chainConfig.layers.length - 1,
          agentId: agent.id,
          output,
        }
        agentOutputs.push(agentOutput)
        onAgentOutput?.(agentOutput)
      }
    }
  }

  const finalBlock = finalLayer.agents[0]
  const finalAgent = agents.find((a) => a.id === finalBlock.agentId)
  if (!finalAgent) {
    throw new Error("Final agent not found")
  }

  const finalPromptBase = finalBlock.prompt || finalAgent.prompt
  const finalInput = currentInputs[0] || currentInputs.join("\n")

  console.log('🏁 [executeAgentChain] Final agent:', finalAgent.id)
  console.log('🏁 [executeAgentChain] Final prompt base:', finalPromptBase)
  console.log('🏁 [executeAgentChain] Final input:', finalInput)

  return {
    prompt: `${finalPromptBase}\n\n${finalInput}`.trim(),
    model: finalAgent.model,
    json_mode: finalAgent.json_mode,
    json_schema: finalAgent.json_schema,
    outputs: agentOutputs,
  }
}
