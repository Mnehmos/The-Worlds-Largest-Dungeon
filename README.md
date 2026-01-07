# The World's Largest Dungeon - AI Assistant

An AI-powered assistant for "The World's Largest Dungeon" D&D campaign, featuring semantic search over dungeon content and structured queries for D&D 5E rules.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GitHub Pages                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Astro Website                                   │  │
│  │                  services/website/                                 │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Railway                                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │              Chat API (Middleware)                                 │  │
│  │              services/chat-api/                                    │  │
│  └──────────┬─────────────────────┬─────────────────────┬────────────┘  │
│             │                     │                     │                │
│    ┌────────┘                     │                     └────────┐       │
│    ▼                              ▼                              ▼       │
│  ┌──────────────┐    ┌──────────────────┐    ┌─────────────────────────┐│
│  │  RAG Server  │    │  SQLite Server   │    │    5e-SRD API (ext)     ││
│  │ rag-server/  │    │ sqlite-server/   │    │  dnd5eapi.co/api/2014   ││
│  └──────────────┘    └──────────────────┘    └─────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
The-Worlds-Largest-Dungeon/
├── .github/workflows/          # CI/CD pipelines
│   ├── website-deploy.yml      # → GitHub Pages
│   ├── chat-api-deploy.yml     # → Railway
│   ├── rag-server-deploy.yml   # → Railway
│   ├── sqlite-server-deploy.yml # → Railway
│   └── ci.yml                  # Build testing
│
├── docs/architecture/          # Architecture Decision Records
│   ├── ADR-001-system-architecture.md
│   └── ADR-002-multi-service-deployment.md
│
├── services/
│   ├── website/               # Astro frontend (GitHub Pages)
│   ├── chat-api/              # Express middleware (Railway)
│   ├── rag-server/            # Index Foundry RAG (Railway)
│   └── sqlite-server/         # better-sqlite3 server (Railway)
│
├── tools/
│   └── data-pipeline/         # Markdown parsers → SQLite
│
└── Resources/markdown/        # Source content
    ├── SRD 5.2/              # D&D 5.2 SRD (48 files)
    └── World's Largest Dungeon/ # Dungeon content (34 files)
```

## Services

### 1. Website (services/website/)

- **Tech:** Astro
- **Deploy:** GitHub Pages
- **Features:** Chat interface, dark fantasy theme, mobile responsive

### 2. Chat API (services/chat-api/)

- **Tech:** Express + TypeScript
- **Deploy:** Railway
- **Features:** Query classification, LLM synthesis via OpenRouter, 5e-SRD integration

### 3. RAG Server (services/rag-server/)

- **Tech:** Index Foundry
- **Deploy:** Railway
- **Features:** 1,940 semantic chunks, hybrid search

### 4. SQLite Server (services/sqlite-server/)

- **Tech:** Express + better-sqlite3
- **Deploy:** Railway
- **Features:** 340 spells, 80 monsters, 205 equipment, 337 rooms

### 5. 5e-SRD API (External)

- **Tech:** Public REST API
- **URL:** https://www.dnd5eapi.co/api/2014
- **Features:** D&D 5e classes, races, spells, monsters, features, traits
- **Usage:** Auto-detected for class/race queries (e.g., "level 3 fighter features")

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/mnehmos/The-Worlds-Largest-Dungeon.git
cd The-Worlds-Largest-Dungeon

# 2. Start SQLite Server (port 3000)
cd services/sqlite-server
npm install && npm run dev

# 3. Start RAG Server (port 8080)
cd ../rag-server
npm install && npm run dev

# 4. Start Chat API (port 8081)
cd ../chat-api
cp .env.example .env  # Configure API keys
npm install && npm run dev

# 5. Start Website (port 4321)
cd ../website
npm install && npm run dev
```

### Environment Variables

#### Chat API (.env)

```env
OPENROUTER_API_KEY=your_openrouter_key
RAG_SERVER_URL=http://localhost:8080
SQLITE_SERVER_URL=http://localhost:3000
GITHUB_OWNER=mnehmos
GITHUB_REPO=The-Worlds-Largest-Dungeon
PORT=8081
```

#### RAG Server (.env)

```env
OPENAI_API_KEY=your_openai_key
PORT=8080
```

## Data Pipeline

Populate the SQLite database from markdown:

```bash
cd tools/data-pipeline
npm install
npm run seed
```

## Deployment

### GitHub Configuration

**Secrets:**

- `RAILWAY_TOKEN` - Railway deployment token

**Variables:**

- `CHAT_API_URL` - Deployed chat API URL
- `SITE_URL` - GitHub Pages URL
- `BASE_PATH` - Repo subdirectory (if applicable)

**GitHub Pages:**

- Enable Pages with "GitHub Actions" source

## API Endpoints

### Chat API

```
POST /chat       - Send chat message
GET  /health     - Service health check
GET  /status     - Detailed service status
```

### RAG Server

```
POST /search     - Vector similarity search
POST /chat       - Chat with RAG context
GET  /health     - Health check
```

### SQLite Server

```
GET /spells      - Query spells (level, school, class)
GET /monsters    - Query monsters (cr, type, size)
GET /equipment   - Query equipment (category, type)
GET /rooms       - Query dungeon rooms (region, id)
GET /health      - Health check
```

## License

This project uses content from:

- **D&D 5.2 SRD** - Open Gaming License
- **The World's Largest Dungeon** - AEG

See respective files for licensing details.

---

_"The World's Largest Dungeon represents years of adventuring. Do not tread lightly."_
