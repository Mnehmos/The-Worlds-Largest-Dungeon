/**
 * Chat Route - POST /chat endpoint
 * 
 * Main entry point for the chat API. Handles:
 * 1. Query classification (semantic vs structured vs hybrid)
 * 2. Routing to RAG and/or SQLite servers
 * 3. Context assembly from multiple sources
 * 4. LLM response synthesis via OpenRouter
 * 5. Source reference mapping to web URLs
 */

import { Router, Request, Response } from 'express';
import { classifyQuery, type ClassificationResult } from '../services/classifier.js';
import { searchRag, buildRagContext, type ProcessedRagResult } from '../services/rag-client.js';
import {
  querySpells,
  queryMonsters,
  queryEquipment,
  queryRooms,
  getRoom,
  buildSqliteContext,
  type ProcessedSqliteResult,
} from '../services/sqlite-client.js';
import { generateResponse, generateStreamingResponse, type Message } from '../llm/openrouter.js';
import type { SourceReference } from '../utils/source-mapper.js';

const router = Router();

// ============================================================================
// Types
// ============================================================================

export interface ChatRequest {
  message: string;
  context?: {
    region?: string;
    category?: 'spells' | 'monsters' | 'equipment' | 'rules' | 'rooms';
  };
  conversationHistory?: Message[];
  stream?: boolean;
}

export interface ChatResponse {
  answer: string;
  sources: SourceReference[];
  query_type: 'semantic' | 'structured' | 'hybrid';
  tool_used: 'sqlite' | 'rag' | 'both' | 'none';  // Which data source was used
  classification: {
    confidence: number;
    reasoning: string;
  };
  tokensUsed?: number;
}

// ============================================================================
// Main Chat Endpoint
// ============================================================================

/**
 * POST /chat
 * 
 * Process a user chat message:
 * 1. Classify the query
 * 2. Fetch relevant context from RAG and/or SQLite
 * 3. Synthesize response via LLM
 * 4. Return answer with source references
 */
router.post('/', async (req: Request<object, object, ChatRequest>, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { message, context: userContext, conversationHistory = [], stream = false } = req.body;
    
    // Validate request
    if (!message || typeof message !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'message is required and must be a string',
      });
      return;
    }
    
    if (message.trim().length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'message cannot be empty',
      });
      return;
    }
    
    // Step 1: Classify the query
    const classification = classifyQuery(message);
    console.log(`[Chat] Query classification: ${classification.type} (${classification.confidence.toFixed(2)}) - ${classification.reasoning}`);
    
    // Step 2: Fetch context based on classification
    const { ragResults, sqliteResults } = await fetchContext(
      message,
      classification,
      userContext
    );
    
    // Determine which tool(s) were used
    const hasRag = ragResults.length > 0;
    const hasSqlite = sqliteResults.length > 0;
    const toolUsed: 'sqlite' | 'rag' | 'both' | 'none' =
      hasRag && hasSqlite ? 'both' :
      hasSqlite ? 'sqlite' :
      hasRag ? 'rag' : 'none';
    
    // Collect all sources with text content for modal display
    const allSources: SourceReference[] = [
      ...ragResults.map(r => ({
        ...r.source,
        text: r.text,           // Include chunk text for modal
        score: r.score,         // Include relevance score
      })),
      ...sqliteResults.map(r => ({
        ...r.source,
        text: r.formattedText,  // Include formatted text for modal
      })),
    ];
    
    // Step 3: Build combined context for LLM
    const combinedContext = buildCombinedContext(ragResults, sqliteResults, classification);
    
    // Step 4: Generate response
    if (stream) {
      // Streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      
      // Send sources first
      res.write(`data: ${JSON.stringify({
        type: 'sources',
        sources: allSources,
        query_type: classification.type,
        tool_used: toolUsed,
        classification: {
          confidence: classification.confidence,
          reasoning: classification.reasoning,
        },
      })}\n\n`);
      
      try {
        await generateStreamingResponse(
          message,
          combinedContext,
          (text) => {
            res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
          },
          () => {
            const duration = Date.now() - startTime;
            res.write(`data: ${JSON.stringify({ type: 'done', duration_ms: duration })}\n\n`);
            res.end();
          },
          conversationHistory
        );
      } catch (error) {
        console.error('[Chat] Streaming error:', error);
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })}\n\n`);
        res.end();
      }
      return;
    }
    
    // Non-streaming response
    const llmResponse = await generateResponse(
      message,
      combinedContext,
      conversationHistory
    );
    
    const duration = Date.now() - startTime;
    console.log(`[Chat] Response generated in ${duration}ms, ${llmResponse.tokensUsed} tokens`);
    
    const response: ChatResponse = {
      answer: llmResponse.content,
      sources: allSources,
      query_type: classification.type,
      tool_used: toolUsed,
      classification: {
        confidence: classification.confidence,
        reasoning: classification.reasoning,
      },
      tokensUsed: llmResponse.tokensUsed,
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('[Chat] Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetch context from RAG and SQLite based on classification
 */
async function fetchContext(
  query: string,
  classification: ClassificationResult,
  userContext?: ChatRequest['context']
): Promise<{
  ragResults: ProcessedRagResult[];
  sqliteResults: ProcessedSqliteResult[];
}> {
  const ragResults: ProcessedRagResult[] = [];
  const sqliteResults: ProcessedSqliteResult[] = [];
  
  const promises: Promise<void>[] = [];
  
  // Fetch from RAG if needed
  if (classification.routing.rag) {
    promises.push(
      searchRag(query, 'hybrid', 8)
        .then(results => {
          ragResults.push(...results);
        })
        .catch(error => {
          console.error('[Chat] RAG search failed:', error);
          // Continue without RAG results
        })
    );
  }
  
  // Fetch from SQLite if needed
  if (classification.routing.sqlite) {
    const endpoints = classification.routing.sqliteEndpoints || [];
    
    // Check for specific room lookup
    if (classification.extractedEntities.roomId) {
      promises.push(
        getRoom(classification.extractedEntities.roomId)
          .then(result => {
            if (result) sqliteResults.push(result);
          })
          .catch(error => {
            console.error('[Chat] Room lookup failed:', error);
          })
      );
    }
    
    // Fallback: if SQLite is enabled but no endpoints specified and no roomId, default to rooms
    if (endpoints.length === 0 && !classification.extractedEntities.roomId) {
      promises.push(
        queryRooms({
          search: query,
          region: userContext?.region,
          limit: 5,
        })
          .then(results => { sqliteResults.push(...results); })
          .catch(error => console.error('[Chat] Fallback rooms query failed:', error))
      );
    }
    
    // Query based on detected entity types
    for (const endpoint of endpoints) {
      switch (endpoint) {
        case 'spells':
          if (!classification.extractedEntities.roomId) {
            // Use extracted spell name if available, otherwise use cleaned search terms
            const spellSearch = classification.extractedEntities.spellName 
              || classification.extractedEntities.searchTerms 
              || query;
            console.log(`[Chat] Spells search: "${spellSearch}" (spellName: ${classification.extractedEntities.spellName}, searchTerms: ${classification.extractedEntities.searchTerms})`);
            promises.push(
              querySpells({
                level: classification.extractedEntities.level,
                search: spellSearch,
                limit: 5,
              })
                .then(results => { 
                  console.log(`[Chat] Spells query returned ${results.length} results`);
                  sqliteResults.push(...results); 
                })
                .catch(error => console.error('[Chat] Spells query failed:', error))
            );
          }
          break;
          
        case 'monsters':
          if (!classification.extractedEntities.roomId) {
            // Use extracted monster name if available, otherwise use cleaned search terms
            const monsterSearch = classification.extractedEntities.monsterName 
              || classification.extractedEntities.searchTerms 
              || query;
            promises.push(
              queryMonsters({
                cr: classification.extractedEntities.cr?.toString(),
                search: monsterSearch,
                limit: 5,
              })
                .then(results => { sqliteResults.push(...results); })
                .catch(error => console.error('[Chat] Monsters query failed:', error))
            );
          }
          break;
          
        case 'equipment':
          // Use cleaned search terms for better matching
          const equipSearch = classification.extractedEntities.searchTerms || query;
          promises.push(
            queryEquipment({
              search: equipSearch,
              limit: 5,
            })
              .then(results => { sqliteResults.push(...results); })
              .catch(error => console.error('[Chat] Equipment query failed:', error))
          );
          break;
          
        case 'rooms':
          if (!classification.extractedEntities.roomId) {
            // Use cleaned search terms for better matching
            const roomSearch = classification.extractedEntities.searchTerms || query;
            promises.push(
              queryRooms({
                region: classification.extractedEntities.region || userContext?.region,
                search: roomSearch,
                limit: 5,
              })
                .then(results => { sqliteResults.push(...results); })
                .catch(error => console.error('[Chat] Rooms query failed:', error))
            );
          }
          break;
      }
    }
    
    // If user specified category context, add that too
    if (userContext?.category && !endpoints.includes(userContext.category as 'spells' | 'monsters' | 'equipment' | 'rooms')) {
      switch (userContext.category) {
        case 'spells':
          promises.push(
            querySpells({ search: query, limit: 3 })
              .then(results => { sqliteResults.push(...results); })
              .catch(error => console.error('[Chat] Category spells query failed:', error))
          );
          break;
        case 'monsters':
          promises.push(
            queryMonsters({ search: query, limit: 3 })
              .then(results => { sqliteResults.push(...results); })
              .catch(error => console.error('[Chat] Category monsters query failed:', error))
          );
          break;
        case 'equipment':
          promises.push(
            queryEquipment({ search: query, limit: 3 })
              .then(results => { sqliteResults.push(...results); })
              .catch(error => console.error('[Chat] Category equipment query failed:', error))
          );
          break;
        case 'rooms':
          promises.push(
            queryRooms({ search: query, region: userContext.region, limit: 3 })
              .then(results => { sqliteResults.push(...results); })
              .catch(error => console.error('[Chat] Category rooms query failed:', error))
          );
          break;
      }
    }
  }
  
  // Wait for all fetches to complete
  await Promise.all(promises);
  
  return { ragResults, sqliteResults };
}

/**
 * Build combined context string for LLM
 */
function buildCombinedContext(
  ragResults: ProcessedRagResult[],
  sqliteResults: ProcessedSqliteResult[],
  classification: ClassificationResult
): string {
  const sections: string[] = [];
  
  // Add SQLite context first (structured data is usually more precise)
  if (sqliteResults.length > 0) {
    sections.push('=== STRUCTURED DATA (SQLite) ===\n' + buildSqliteContext(sqliteResults));
  }
  
  // Add RAG context
  if (ragResults.length > 0) {
    sections.push('=== DOCUMENT SEARCH (RAG) ===\n' + buildRagContext(ragResults));
  }
  
  if (sections.length === 0) {
    return `No relevant information found for this query.
Classification: ${classification.type} (confidence: ${classification.confidence.toFixed(2)})
Reason: ${classification.reasoning}

Please answer based on your general D&D 5e knowledge if applicable.`;
  }
  
  return sections.join('\n\n');
}

export { router as chatRouter };
