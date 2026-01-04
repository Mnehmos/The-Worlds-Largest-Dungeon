/**
 * OpenRouter LLM Integration - Uses open source 120b class models via OpenRouter API
 * 
 * Supports streaming responses for real-time chat experience.
 * Default model: microsoft/wizardlm-2-8x22b (can be configured via env)
 */

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Default to OpenAI's 120B OSS model - can be overridden via env
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b';

// Alternative models (various tiers)
export const AVAILABLE_MODELS = {
  'gpt-oss-120b': 'openai/gpt-oss-120b',
  'llama-3.1-8b': 'meta-llama/llama-3.1-8b-instruct:free',
  'llama-3.1-70b': 'meta-llama/llama-3.1-70b-instruct',
  'qwen-2.5-72b': 'qwen/qwen-2.5-72b-instruct',
  'mistral-nemo': 'mistralai/mistral-nemo:free',
} as const;

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: Message[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamChunk {
  id: string;
  choices: Array<{
    delta: {
      content?: string;
      role?: string;
    };
    finish_reason: string | null;
  }>;
}

// D&D-specific system prompt
const DND_SYSTEM_PROMPT = `You are a helpful D&D 5th Edition assistant for "The World's Largest Dungeon" campaign.

You have access to:
- Complete SRD 5.2 rules (spells, monsters, equipment, game mechanics)
- Detailed dungeon room descriptions from the World's Largest Dungeon module
- Encounter and trap information for DM reference

When answering questions:
- Be accurate and cite specific sources inline using (Source N) notation where N is the source number
- For game mechanics, quote the exact rules from the SRD
- For dungeon content, reference specific room numbers (e.g., "Room A42", "Region B")
- Be concise but complete - DMs need quick answers during sessions
- If information is not in the provided context, say so clearly
- Format stat blocks and tables clearly using markdown

IMPORTANT FORMATTING RULES:
- Use (Source N) inline when citing information, e.g., "Fireball deals 8d6 fire damage (Source 2)"
- DO NOT add a "References" or "Sources" section at the end - the UI handles source display automatically
- Just reference sources inline where relevant using (Source N) format`;

/**
 * Generate a response using OpenRouter API (non-streaming)
 * 
 * @param query - User's question
 * @param context - Combined context from RAG and SQLite sources
 * @param conversationHistory - Previous messages for multi-turn context
 * @param options - Additional options (model, temperature, etc.)
 */
export async function generateResponse(
  query: string,
  context: string,
  conversationHistory: Message[] = [],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    customSystemPrompt?: string;
  } = {}
): Promise<{ content: string; tokensUsed: number }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }
  
  const model = options.model || DEFAULT_MODEL;
  const systemPrompt = options.customSystemPrompt || DND_SYSTEM_PROMPT;
  
  const messages: Message[] = [
    {
      role: 'system',
      content: `${systemPrompt}\n\nRETRIEVED CONTEXT:\n${context || 'No relevant context found.'}`,
    },
    ...conversationHistory,
    {
      role: 'user',
      content: query,
    },
  ];
  
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://wld-chat.railway.app',
      'X-Title': 'World\'s Largest Dungeon Chat',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature ?? 0.7,
      stream: false,
    } satisfies OpenRouterRequest),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenRouter API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }
  
  const data = await response.json() as OpenRouterResponse;
  
  return {
    content: data.choices[0]?.message?.content || '',
    tokensUsed: data.usage?.total_tokens || 0,
  };
}

/**
 * Generate a streaming response using OpenRouter API
 * 
 * @param query - User's question
 * @param context - Combined context from RAG and SQLite sources
 * @param onChunk - Callback for each streamed chunk
 * @param conversationHistory - Previous messages for multi-turn context
 * @param options - Additional options
 */
export async function generateStreamingResponse(
  query: string,
  context: string,
  onChunk: (text: string) => void,
  onComplete: () => void,
  conversationHistory: Message[] = [],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    customSystemPrompt?: string;
  } = {}
): Promise<void> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }
  
  const model = options.model || DEFAULT_MODEL;
  const systemPrompt = options.customSystemPrompt || DND_SYSTEM_PROMPT;
  
  const messages: Message[] = [
    {
      role: 'system',
      content: `${systemPrompt}\n\nRETRIEVED CONTEXT:\n${context || 'No relevant context found.'}`,
    },
    ...conversationHistory,
    {
      role: 'user',
      content: query,
    },
  ];
  
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://wld-chat.railway.app',
      'X-Title': 'World\'s Largest Dungeon Chat',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature ?? 0.7,
      stream: true,
    } satisfies OpenRouterRequest),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenRouter API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }
  
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body reader available');
  }
  
  const decoder = new TextDecoder();
  let buffer = '';
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          if (line === 'data: [DONE]') {
            continue;
          }
          
          try {
            const data = JSON.parse(line.slice(6)) as StreamChunk;
            const content = data.choices?.[0]?.delta?.content;
            
            if (content) {
              onChunk(content);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
    onComplete();
  }
}

/**
 * Check if OpenRouter API is configured and accessible
 */
export async function checkOpenRouterHealth(): Promise<{
  configured: boolean;
  accessible: boolean;
  model: string;
}> {
  const configured = Boolean(OPENROUTER_API_KEY);
  
  if (!configured) {
    return { configured: false, accessible: false, model: DEFAULT_MODEL };
  }
  
  try {
    // Simple test request to check API access
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
    });
    
    return {
      configured: true,
      accessible: response.ok,
      model: DEFAULT_MODEL,
    };
  } catch {
    return { configured: true, accessible: false, model: DEFAULT_MODEL };
  }
}

/**
 * Get OpenRouter configuration for diagnostics
 */
export function getOpenRouterConfig(): {
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
} {
  return {
    baseUrl: OPENROUTER_BASE_URL,
    model: DEFAULT_MODEL,
    apiKeyConfigured: Boolean(OPENROUTER_API_KEY),
  };
}
