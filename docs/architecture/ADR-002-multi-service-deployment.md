# ADR-002: Multi-Service Deployment Architecture

**Status:** Approved  
**Date:** 2026-01-04  
**Supersedes:** Portions of ADR-001 (deployment section)

## Context

The project requires separation of concerns with independent deployment pipelines for each service. Each service will have its own folder, Dockerfile, CI/CD via GitHub Actions, and deployment configuration.

## Decision

### Service Separation

```
The-Worlds-Largest-Dungeon/
├── README.md
├── docs/architecture/
│
├── services/
│   ├── rag-server/          # Index Foundry RAG service → Railway
│   ├── sqlite-server/       # SQLite MCP server → Railway
│   ├── chat-api/            # Middleware + /chat endpoint → Railway
│   └── website/             # Astro frontend → GitHub Pages
│
└── Resources/               # Source content (markdown, PDFs)
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GitHub Pages                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Astro Website                                   │  │
│  │                  services/website/                                 │  │
│  │                                                                    │  │
│  │  • Static chat UI                                                  │  │
│  │  • Calls chat-api.railway.app                                      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Railway                                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │              Chat API (Middleware)                                 │  │
│  │              services/chat-api/                                    │  │
│  │                                                                    │  │
│  │  POST /chat                                                        │  │
│  │    1. Classify query (RAG vs SQLite vs Hybrid)                     │  │
│  │    2. Route to appropriate backend                                 │  │
│  │    3. Synthesize response via OSS 120b (OpenRouter)                │  │
│  └──────────────────────┬─────────────────────┬──────────────────────┘  │
│                         │                     │                          │
│            ┌────────────┘                     └────────────┐             │
│            ▼                                               ▼             │
│  ┌─────────────────────┐                     ┌─────────────────────────┐│
│  │    RAG Server       │                     │    SQLite Server        ││
│  │  services/rag-server│                     │  services/sqlite-server ││
│  │                     │                     │                         ││
│  │  • Index Foundry    │                     │  • Spells table         ││
│  │  • Vector search    │                     │  • Monsters table       ││
│  │  • Markdown chunks  │                     │  • Equipment table      ││
│  │                     │                     │  • Rooms table          ││
│  └─────────────────────┘                     └─────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Service Specifications

### 1. Website (Astro → GitHub Pages)

**Location:** `services/website/`

**Technology:**
- Astro with static site generation
- Deployed via GitHub Actions to GitHub Pages

**Files:**
```
services/website/
├── package.json
├── astro.config.mjs
├── tsconfig.json
├── src/
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   └── index.astro
│   └── components/
│       ├── ChatInterface.astro
│       ├── SearchBar.astro
│       └── ResultsPanel.astro
├── public/
│   └── favicon.svg
└── .github/
    └── workflows/
        └── deploy.yml
```

**GitHub Action:** `.github/workflows/website-deploy.yml`
```yaml
name: Deploy Website to GitHub Pages

on:
  push:
    branches: [master]
    paths:
      - 'services/website/**'
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        working-directory: services/website
        run: npm ci
        
      - name: Build
        working-directory: services/website
        run: npm run build
        env:
          CHAT_API_URL: ${{ vars.CHAT_API_URL }}
          
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: services/website/dist
```

---

### 2. Chat API (Middleware → Railway)

**Location:** `services/chat-api/`

**Technology:**
- Node.js + Express
- OSS 120b via OpenRouter (free tier)
- Query classification logic

**Files:**
```
services/chat-api/
├── package.json
├── tsconfig.json
├── Dockerfile
├── railway.toml
├── src/
│   ├── index.ts
│   ├── routes/
│   │   └── chat.ts
│   ├── services/
│   │   ├── classifier.ts    # RAG vs SQLite routing
│   │   ├── rag-client.ts    # Calls RAG server
│   │   └── sqlite-client.ts # Calls SQLite server
│   └── llm/
│       └── openrouter.ts    # OSS 120b integration
└── .github/
    └── workflows/
        └── deploy.yml
```

**Dockerfile:**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

**railway.toml:**
```toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 30

[service]
internalPort = 8080
```

**Environment Variables:**
```env
OPENROUTER_API_KEY=...
RAG_SERVER_URL=https://rag-server-xxx.railway.app
SQLITE_SERVER_URL=https://sqlite-server-xxx.railway.app
PORT=8080
```

**GitHub Action:** `.github/workflows/chat-api-deploy.yml`
```yaml
name: Deploy Chat API to Railway

on:
  push:
    branches: [master]
    paths:
      - 'services/chat-api/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Railway CLI
        run: npm install -g @railway/cli
        
      - name: Deploy to Railway
        working-directory: services/chat-api
        run: railway up --service chat-api
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

---

### 3. RAG Server (Index Foundry → Railway)

**Location:** `services/rag-server/`

**Technology:**
- Index Foundry generated server
- Vector embeddings via OpenAI
- Semantic search over markdown content

**Files:**
```
services/rag-server/
├── package.json
├── tsconfig.json
├── Dockerfile
├── railway.toml
├── data/
│   ├── chunks.jsonl        # Generated by Index Foundry
│   └── vectors.jsonl       # Generated by Index Foundry
├── src/
│   └── index.ts            # Generated by Index Foundry
└── .github/
    └── workflows/
        └── deploy.yml
```

**railway.toml:**
```toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 30

[service]
internalPort = 8080
```

**Environment Variables:**
```env
OPENAI_API_KEY=...  # For embedding queries
PORT=8080
```

---

### 4. SQLite Server (Custom MCP → Railway)

**Location:** `services/sqlite-server/`

**Technology:**
- Node.js + better-sqlite3
- MCP-style tool interface (HTTP)
- Pre-populated database from markdown parsing

**Files:**
```
services/sqlite-server/
├── package.json
├── tsconfig.json
├── Dockerfile
├── railway.toml
├── data/
│   └── dnd-rules.db        # SQLite database
├── src/
│   ├── index.ts
│   ├── db.ts               # Database connection
│   └── routes/
│       ├── spells.ts
│       ├── monsters.ts
│       ├── equipment.ts
│       └── rooms.ts
└── .github/
    └── workflows/
        └── deploy.yml
```

**railway.toml:**
```toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 30

[service]
internalPort = 3000
```

---

## Data Pipeline

The data pipeline (parsing markdown → populating SQLite/vectors) runs as a local build step or CI job:

```
Resources/markdown/
       │
       ├─► services/rag-server/data/     (Index Foundry build)
       │
       └─► services/sqlite-server/data/  (Parser scripts)
```

**Pipeline Location:** `tools/data-pipeline/`
```
tools/
└── data-pipeline/
    ├── package.json
    ├── src/
    │   ├── parsers/
    │   │   ├── spell-parser.ts
    │   │   ├── monster-parser.ts
    │   │   ├── equipment-parser.ts
    │   │   └── room-parser.ts
    │   └── seed-database.ts
    └── output/
```

---

## API Contracts

### Chat API Endpoints

```typescript
// POST /chat
interface ChatRequest {
  message: string;
  context?: {
    region?: string;     // Filter to specific dungeon region
    category?: string;   // spells, monsters, equipment, rules
  };
}

interface ChatResponse {
  answer: string;
  sources: Array<{
    type: 'rag' | 'sqlite';
    reference: string;
  }>;
  query_type: 'semantic' | 'structured' | 'hybrid';
}

// GET /health
interface HealthResponse {
  status: 'ok';
  services: {
    rag: boolean;
    sqlite: boolean;
  };
}
```

### RAG Server Endpoints

```typescript
// POST /search
interface SearchRequest {
  query: string;
  top_k?: number;
  filters?: {
    source?: string;
    region?: string;
  };
}

interface SearchResponse {
  results: Array<{
    chunk_id: string;
    text: string;
    score: number;
    metadata: Record<string, unknown>;
  }>;
}
```

### SQLite Server Endpoints

```typescript
// GET /spells?level=3&class=Wizard
// GET /monsters?cr=5&type=Fiend
// GET /equipment?category=Weapon
// GET /rooms?region=A&id=A42
```

---

## Deployment Domains

| Service | Platform | URL |
|---------|----------|-----|
| Website | GitHub Pages | `https://mnehmos.github.io/The-Worlds-Largest-Dungeon/` |
| Chat API | Railway | `https://chat-api-xxx.railway.app` |
| RAG Server | Railway | `https://rag-server-xxx.railway.app` (internal) |
| SQLite Server | Railway | `https://sqlite-server-xxx.railway.app` (internal) |

---

## Consequences

### Positive
- Clear separation of concerns
- Independent deployment cycles per service
- Free hosting for website via GitHub Pages
- Free LLM via OpenRouter OSS 120b
- Each service can scale independently

### Negative
- More complex CI/CD setup (4 deployment pipelines)
- Need to coordinate service URLs across deployments
- Cross-service latency for hybrid queries

### Mitigations
- Use Railway internal networking for service-to-service calls
- Cache common queries at Chat API layer
- Monorepo structure keeps code colocated despite separate deployments
