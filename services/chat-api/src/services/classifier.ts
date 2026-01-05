/**
 * Query Classifier - Determines query type and routes to both RAG and SQLite
 *
 * Classification Types (for analytics/debugging):
 * - 'structured': Lists, lookups, entity queries (keywords: list, all, find, etc.)
 * - 'semantic': Explanations, lore, gameplay (keywords: how does, explain, etc.)
 * - 'hybrid': Room/region lookups with context
 *
 * Routing Behavior:
 * - ALL queries route to BOTH RAG and SQLite for comprehensive results
 * - The classification type is preserved for analytics and debugging
 * - SQLite endpoints are selected based on detected entities, defaulting to 'rooms'
 */

export interface ClassificationResult {
  type: 'semantic' | 'structured' | 'hybrid';
  confidence: number;
  routing: {
    rag: boolean;
    sqlite: boolean;
    sqliteEndpoints?: ('spells' | 'monsters' | 'equipment' | 'rooms')[];
  };
  extractedEntities: {
    roomId?: string;
    region?: string;
    spellName?: string;
    monsterName?: string;
    equipmentName?: string;
    level?: number;
    cr?: number | string;
    searchTerms?: string;  // Cleaned search terms for SQLite queries
  };
  reasoning: string;
}

// Keywords that indicate structured database queries
const STRUCTURED_KEYWORDS = [
  'list',
  'all',
  'how many',
  'count',
  'level',
  'cr',
  'challenge rating',
  'type',
  'category',
  'school',
  'class',
  'find',
  'show me',
  'what are',
  'which',
];

// Entity types that map to SQLite tables
const ENTITY_KEYWORDS = {
  spells: ['spell', 'spells', 'cantrip', 'cantrips', 'ritual', 'rituals', 'cast', 'casting'],
  monsters: ['monster', 'monsters', 'creature', 'creatures', 'enemy', 'enemies', 'cr', 'challenge rating'],
  equipment: ['equipment', 'item', 'items', 'weapon', 'weapons', 'armor', 'armour', 'tool', 'tools', 'gear'],
  rooms: ['room', 'rooms', 'chamber', 'chambers', 'area', 'corridor', 'hallway'],
};

// Patterns for extracting specific identifiers
const ROOM_ID_PATTERN = /\b([A-D])[-\s]?(\d{1,3})\b/i;
const REGION_PATTERN = /\b(region|area)\s*([A-D])\b/i;
const SPELL_LEVEL_PATTERN = /\blevel\s*(\d)\b|\b(\d)(?:st|nd|rd|th)?\s*level\b/i;
const CR_PATTERN = /\bcr\s*(\d+(?:\/\d+)?)\b|\bchallenge\s*rating\s*(\d+(?:\/\d+)?)\b/i;

// Keywords indicating semantic/explanation queries
const SEMANTIC_KEYWORDS = [
  'how does',
  'how do',
  'what is',
  'what are',
  'explain',
  'describe',
  'tell me about',
  'what happens',
  'what\'s',
  'overview',
  'guide',
  'rules for',
  'mechanics',
  'strategy',
  'lore',
  'story',
  'background',
  'history',
];

/**
 * Classifies a user query to determine optimal routing
 * 
 * @param query - The user's natural language query
 * @returns Classification result with routing decisions
 */
export function classifyQuery(query: string): ClassificationResult {
  const lowerQuery = query.toLowerCase().trim();
  const words = lowerQuery.split(/\s+/);
  
  // All SQLite endpoints for comprehensive coverage
  const ALL_ENDPOINTS: ('spells' | 'monsters' | 'equipment' | 'rooms')[] = ['spells', 'monsters', 'equipment', 'rooms'];
  
  // Initialize result - default to querying all sources
  const result: ClassificationResult = {
    type: 'semantic',
    confidence: 0.5,
    routing: {
      rag: true,
      sqlite: true,  // Always query SQLite
      sqliteEndpoints: ALL_ENDPOINTS,  // Default to all endpoints
    },
    extractedEntities: {},
    reasoning: '',
  };
  
  // Extract entities
  const roomMatch = query.match(ROOM_ID_PATTERN);
  if (roomMatch) {
    result.extractedEntities.roomId = `${roomMatch[1].toUpperCase()}${roomMatch[2]}`;
    result.extractedEntities.region = roomMatch[1].toUpperCase();
  }
  
  const regionMatch = query.match(REGION_PATTERN);
  if (regionMatch) {
    result.extractedEntities.region = regionMatch[2].toUpperCase();
  }
  
  const levelMatch = query.match(SPELL_LEVEL_PATTERN);
  if (levelMatch) {
    result.extractedEntities.level = parseInt(levelMatch[1] || levelMatch[2], 10);
  }
  
  const crMatch = query.match(CR_PATTERN);
  if (crMatch) {
    result.extractedEntities.cr = crMatch[1] || crMatch[2];
  }
  
  // Extract specific entity names for targeted SQLite search
  const extractedSpell = extractSpellName(query);
  if (extractedSpell) {
    result.extractedEntities.spellName = extractedSpell;
  }
  
  const extractedMonster = extractMonsterName(query);
  if (extractedMonster) {
    result.extractedEntities.monsterName = extractedMonster;
  }
  
  // Extract generic search terms by removing common words
  result.extractedEntities.searchTerms = extractSearchTerms(query);
  
  // Score structured indicators
  let structuredScore = 0;
  const matchedStructuredKeywords: string[] = [];
  
  for (const keyword of STRUCTURED_KEYWORDS) {
    if (lowerQuery.includes(keyword)) {
      structuredScore += 1;
      matchedStructuredKeywords.push(keyword);
    }
  }
  
  // Detect entity types mentioned
  const detectedEntities: ('spells' | 'monsters' | 'equipment' | 'rooms')[] = [];
  
  for (const [entityType, keywords] of Object.entries(ENTITY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (words.includes(keyword) || lowerQuery.includes(keyword)) {
        detectedEntities.push(entityType as keyof typeof ENTITY_KEYWORDS);
        structuredScore += 0.5;
        break;
      }
    }
  }
  
  // Score semantic indicators
  let semanticScore = 0;
  const matchedSemanticKeywords: string[] = [];
  
  for (const keyword of SEMANTIC_KEYWORDS) {
    if (lowerQuery.includes(keyword)) {
      semanticScore += 1;
      matchedSemanticKeywords.push(keyword);
    }
  }
  
  // Room-specific queries are hybrid (need both structured data and lore context)
  if (result.extractedEntities.roomId) {
    result.type = 'hybrid';
    result.confidence = 0.9;
    result.routing = {
      rag: true,
      sqlite: true,
      sqliteEndpoints: ['rooms'],
    };
    result.reasoning = `Query mentions specific room ${result.extractedEntities.roomId}, routing to both RAG for context and SQLite for structured room data.`;
    return result;
  }
  
  // Region queries are also hybrid
  if (result.extractedEntities.region && !result.extractedEntities.roomId) {
    result.type = 'hybrid';
    result.confidence = 0.8;
    result.routing = {
      rag: true,
      sqlite: true,
      sqliteEndpoints: ['rooms'],
    };
    result.reasoning = `Query mentions Region ${result.extractedEntities.region}, routing to both RAG for lore and SQLite for room listings.`;
    return result;
  }
  
  // Strong structured indicators
  if (structuredScore > semanticScore && structuredScore >= 2) {
    result.type = 'structured';
    result.confidence = Math.min(0.95, 0.6 + structuredScore * 0.1);
    result.routing = {
      rag: true,
      sqlite: true,
      sqliteEndpoints: detectedEntities.length > 0 ? [...new Set(detectedEntities)] : ['spells', 'monsters'],
    };
    result.reasoning = `Structured query detected (keywords: ${matchedStructuredKeywords.join(', ')}). Routing to both RAG and SQLite for ${detectedEntities.join(', ') || 'entity lookup'}.`;
    return result;
  }
  
  // Mixed signals - use hybrid
  if (structuredScore > 0 && semanticScore > 0) {
    result.type = 'hybrid';
    result.confidence = 0.7;
    result.routing = {
      rag: true,
      sqlite: true,
      sqliteEndpoints: detectedEntities.length > 0 ? [...new Set(detectedEntities)] : ALL_ENDPOINTS,
    };
    result.reasoning = `Mixed query type (structured: ${matchedStructuredKeywords.join(', ')}, semantic: ${matchedSemanticKeywords.join(', ')}). Routing to both sources (${detectedEntities.length > 0 ? detectedEntities.join(', ') : 'all endpoints'}).`;
    return result;
  }
  
  // Use ALL_ENDPOINTS defined at function start
  
  // Default to semantic (RAG) - but also include SQLite for comprehensive results
  result.type = 'semantic';
  result.confidence = semanticScore > 0 ? Math.min(0.9, 0.6 + semanticScore * 0.1) : 0.6;
  result.routing = {
    rag: true,
    sqlite: true,
    sqliteEndpoints: ALL_ENDPOINTS,  // Query ALL endpoints for comprehensive coverage
  };
  result.reasoning = semanticScore > 0
    ? `Semantic query detected (keywords: ${matchedSemanticKeywords.join(', ')}). Routing to both RAG and SQLite (all endpoints) for comprehensive results.`
    : `No strong signals detected, routing to both RAG and SQLite (all endpoints) for comprehensive context.`;
  
  return result;
}

/**
 * Extract a potential spell name from the query
 */
export function extractSpellName(query: string): string | undefined {
  // Common spell name patterns
  const patterns = [
    /cast(?:ing)?\s+(?:the\s+)?["']?([a-z\s]+)["']?\s*(?:spell)?/i,
    /(?:the\s+)?["']?([a-z\s]+)["']?\s+spell/i,
    /spell\s+(?:called\s+)?["']?([a-z\s]+)["']?/i,
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * Extract a potential monster/creature name from the query
 */
export function extractMonsterName(query: string): string | undefined {
  const patterns = [
    /(?:fight(?:ing)?|encounter(?:ing)?|facing)\s+(?:a\s+)?["']?([a-z\s]+)["']?/i,
    /["']?([a-z\s]+)["']?\s+(?:monster|creature|enemy)/i,
    /(?:about|the)\s+["']?([a-z\s]+)["']?\s+(?:stat(?:s)?|abilities|attacks)/i,
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * Extract search terms from a query by removing common/stop words.
 * This improves SQLite search matching by focusing on the key terms.
 */
export function extractSearchTerms(query: string): string {
  // Common words to remove (stop words)
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them',
    'this', 'that', 'these', 'those', 'am', 'of', 'for', 'to', 'in', 'on', 'at',
    'by', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'from', 'up', 'down', 'out', 'off',
    'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
    'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'can', 'just', 'now', 'also', 'get', 'tell', 'work', 'use', 'make',
    // D&D-specific words to remove (we want the entity name, not these)
    'spell', 'spells', 'monster', 'monsters', 'creature', 'creatures',
    'stats', 'stat', 'statistics', 'abilities', 'ability', 'attacks', 'attack',
    'describe', 'explain', 'show', 'find', 'look', 'looking', 'need',
    'room', 'rooms', 'region', 'area', 'level', 'class', 'classes',
    'equipment', 'item', 'items', 'weapon', 'weapons', 'armor',
    'traps', 'trap', 'treasure', 'loot',
  ]);
  
  // Clean and tokenize
  const cleaned = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.has(word))
    .join(' ');
  
  return cleaned || query;  // Fallback to original if everything was filtered
}
