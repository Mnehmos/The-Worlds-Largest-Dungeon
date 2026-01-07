/**
 * Chat API Server
 * 
 * Central middleware service that:
 * - Receives user queries
 * - Classifies them (RAG vs SQLite vs Hybrid)
 * - Routes to appropriate backends
 * - Synthesizes responses using OSS 120b via OpenRouter
 * - Returns answers with web-accessible source URLs
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { chatRouter } from './routes/chat.js';
import { checkRagHealth, getRagServerUrl } from './services/rag-client.js';
import { checkSqliteHealth, getSqliteServerUrl } from './services/sqlite-client.js';
import { checkSrdHealth } from './services/srd-client.js';
import { checkOpenRouterHealth, getOpenRouterConfig } from './llm/openrouter.js';
import { getGitHubConfig } from './utils/source-mapper.js';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// ============================================================================
// Security Configuration
// ============================================================================

// Allowed origins for CORS (comma-separated in env var, or defaults)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'https://mnehmos.github.io',
      'http://localhost:4321',
      'http://localhost:3000',
    ];

console.log('[Security] Allowed CORS origins:', ALLOWED_ORIGINS);

// Rate limiting: 30 requests per minute per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    error: 'Too many requests',
    message: 'Please wait before making more requests',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Middleware
// ============================================================================

// CORS - restrict to allowed origins
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from: ${origin}`);
      callback(new Error('CORS: Origin not allowed'));
    }
  },
  credentials: true,
}));

// JSON body parsing
app.use(express.json({ limit: '1mb' }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Apply rate limiting to chat endpoint
app.use('/chat', chatLimiter);

// ============================================================================
// Health Check Endpoint
// ============================================================================

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  services: {
    rag: boolean;
    sqlite: boolean;
    srd: boolean;
    llm: boolean;
  };
  config: {
    ragServerUrl: string;
    sqliteServerUrl: string;
    srdApiUrl: string;
    openrouterModel: string;
    openrouterConfigured: boolean;
    gitHub: {
      owner: string;
      repo: string;
      branch: string;
    };
  };
  uptime: number;
  version: string;
}

app.get('/health', async (_req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Check all services in parallel
  const [ragHealth, sqliteHealth, srdHealth, llmHealth] = await Promise.all([
    checkRagHealth(),
    checkSqliteHealth(),
    checkSrdHealth(),
    checkOpenRouterHealth(),
  ]);
  
  const services = {
    rag: ragHealth !== null,
    sqlite: sqliteHealth !== null,
    srd: srdHealth,
    llm: llmHealth.accessible,
  };
  
  // Determine overall status
  let status: 'ok' | 'degraded' | 'error';
  const allHealthy = services.rag && services.sqlite && services.llm;
  const anyHealthy = services.rag || services.sqlite;
  
  if (allHealthy) {
    status = 'ok';
  } else if (anyHealthy) {
    status = 'degraded';
  } else {
    status = 'error';
  }
  
  const openRouterConfig = getOpenRouterConfig();
  const gitHubConfig = getGitHubConfig();
  
  const response: HealthResponse = {
    status,
    services,
    config: {
      ragServerUrl: getRagServerUrl(),
      sqliteServerUrl: getSqliteServerUrl(),
      srdApiUrl: 'https://www.dnd5eapi.co/api/2014',
      openrouterModel: openRouterConfig.model,
      openrouterConfigured: openRouterConfig.apiKeyConfigured,
      gitHub: gitHubConfig,
    },
    uptime: Math.floor(process.uptime()),
    version: '1.0.0',
  };
  
  const checkDuration = Date.now() - startTime;
  console.log(`[Health] Check completed in ${checkDuration}ms - status: ${status}`);
  
  // Return appropriate status code
  const statusCode = status === 'error' ? 503 : 200;
  res.status(statusCode).json(response);
});

// ============================================================================
// API Routes
// ============================================================================

// Main chat endpoint
app.use('/chat', chatRouter);

// Simple status endpoint (no health checks)
app.get('/status', (_req: Request, res: Response) => {
  const openRouterConfig = getOpenRouterConfig();
  const gitHubConfig = getGitHubConfig();
  
  res.json({
    service: 'chat-api',
    status: 'running',
    config: {
      ragServerUrl: getRagServerUrl(),
      sqliteServerUrl: getSqliteServerUrl(),
      openrouterConfigured: openRouterConfig.apiKeyConfigured,
      gitHub: gitHubConfig,
    },
    uptime: Math.floor(process.uptime()),
    version: '1.0.0',
  });
});

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    endpoints: {
      health: 'GET /health - Health check with service status',
      status: 'GET /status - Quick status without health checks',
      chat: 'POST /chat - Main chat endpoint',
    },
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// ============================================================================
// Server Startup
// ============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🎲 Chat API Server - World\'s Largest Dungeon');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Port:           ${PORT}`);
  console.log(`  RAG Server:     ${getRagServerUrl()}`);
  console.log(`  SQLite Server:  ${getSqliteServerUrl()}`);
  console.log(`  OpenRouter:     ${getOpenRouterConfig().apiKeyConfigured ? 'Configured ✓' : 'NOT CONFIGURED ✗'}`);
  console.log(`  Model:          ${getOpenRouterConfig().model}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('  Endpoints:');
  console.log('    GET  /health  - Health check with service connectivity');
  console.log('    GET  /status  - Quick status check');
  console.log('    POST /chat    - Main chat endpoint');
  console.log('═══════════════════════════════════════════════════════════════');
});

export { app };
