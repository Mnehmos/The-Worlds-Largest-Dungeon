# The World's Largest Dungeon - RAG Chatbot

A web application that provides an intelligent D&D 5E assistant powered by RAG (Retrieval-Augmented Generation) for running *The World's Largest Dungeon* adventure module.

## 🎯 Project Goal

Build an AI-powered Dungeon Master assistant that can:
- Answer questions about D&D 5E rules from the SRD 5.2
- Provide room descriptions, monster stats, and encounter details from The World's Largest Dungeon
- Track game state using structured SQLite storage
- Deliver fast, contextual responses through semantic search

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Web Application                         │
│                   (Chat Interface)                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌─────────────────────┐       ┌─────────────────────┐
│    RAG Server       │       │   SQLite Server     │
│  (Vector Search)    │       │ (Structured Data)   │
│                     │       │                     │
│ • Semantic search   │       │ • Game state        │
│ • Context retrieval │       │ • Character data    │
│ • Chunk embeddings  │       │ • Session tracking  │
└─────────────────────┘       └─────────────────────┘
          │                               │
          └───────────────┬───────────────┘
                          │
                          ▼
            ┌─────────────────────────┐
            │     LLM (Claude)        │
            │   Response Generation   │
            └─────────────────────────┘
```

### RAG Server
- **Purpose**: Semantic search over D&D content
- **Data Sources**: 
  - SRD 5.2 (rules, classes, spells, monsters, items)
  - World's Largest Dungeon (rooms, encounters, regions)
- **Technology**: Vector embeddings + similarity search

### SQLite Server
- **Purpose**: Structured game state management
- **Data Stored**:
  - Character sheets and party composition
  - Room exploration status
  - Combat encounters and initiative
  - Session notes and campaign progress

## 📚 Content Sources

### SRD 5.2 (System Reference Document)
The official D&D 5th Edition rules released under Creative Commons CC-BY-4.0.

| Section | Files | Description |
|---------|-------|-------------|
| Core Rules | 01-02 | Playing the Game, Character Creation |
| Classes | 03a-03e | All 12 classes with subclasses |
| Origins | 04 | Backgrounds and Species |
| Feats | 05 | Origin, General, Fighting Style, Epic Boons |
| Equipment | 06 | Weapons, Armor, Gear |
| Spells | 07a-07h | Complete spell list (A-Z) |
| Rules Glossary | 08 | Conditions, terms, definitions |
| Toolbox | 09 | DM tools and optional rules |
| Magic Items | 10a-10e | Complete magic item catalog |
| Monsters | 11a-11i | Monster stat blocks |
| Animals | 12a-12b | Beast stat blocks |

### World's Largest Dungeon
A massive dungeon crawl adventure covering levels 1-20.

| Region | Levels | Theme |
|--------|--------|-------|
| **A** | 1-3 | Orcs, kobolds, wererat conflict |
| **B** | 4-6 | Goblin empire, traps |
| **C** | 7-9 | Puzzles, black dragon, spectre |
| **D** | 14-18 | Derro, xill, enslaved races |

Each region includes:
- Room-by-room encounter descriptions
- Monster stat blocks (bestiary)
- Tactical advice and scaling options

## 🗂️ Repository Structure

```
The-Worlds-Largest-Dungeon/
├── README.md                          # This file
├── Resources/
│   ├── markdown/
│   │   ├── SRD 5.2/                   # D&D 5E rules
│   │   │   ├── 00-Legal-Information.md # Index + License
│   │   │   ├── 01-Playing-the-Game.md
│   │   │   ├── 02-Character-Creation.md
│   │   │   ├── 03-Classes.md          # Overview
│   │   │   ├── 03a-03e-Classes-*.md   # Split by class
│   │   │   ├── 04-Character-Origins.md
│   │   │   ├── 05-Feats.md
│   │   │   ├── 06-Equipment.md
│   │   │   ├── 07-Spells.md           # Overview
│   │   │   ├── 07a-07h-Spells-*.md    # Spell lists A-Z
│   │   │   ├── 08-Rules-Glossary.md
│   │   │   ├── 09-Gameplay-Toolbox.md
│   │   │   ├── 10-Magic-Items.md      # Overview
│   │   │   ├── 10a-10e-Magic-Items-*.md
│   │   │   ├── 11-Monsters.md         # Overview
│   │   │   ├── 11a-11i-Monsters-*.md
│   │   │   ├── 12-Animals.md          # Overview
│   │   │   └── 12a-12b-Animals-*.md
│   │   │
│   │   └── World's Largest Dungeon/   # Adventure module
│   │       ├── 00-Introduction.md     # Index + DM guide
│   │       ├── 01-Region-A.md         # Overview
│   │       ├── 01a-01h-Region-A-*.md  # Room encounters
│   │       ├── 02-Region-B.md
│   │       ├── 02a-02h-Region-B-*.md
│   │       ├── 03-Region-C.md
│   │       ├── 03a-03f-Region-C-*.md
│   │       ├── 04-Region-D.md
│   │       ├── 04a-04f-Region-D-*.md
│   │       ├── 05-Bestiary-Region-A.md
│   │       ├── 06-Bestiary-Region-B.md
│   │       ├── 07-Bestiary-Region-C.md
│   │       └── 08-Bestiary-Region-D.md
│   │
│   └── pdf/                           # Original source PDFs
│       ├── SRD 5.2.pdf
│       └── World's Largest Dungeon Book 1.pdf
```

## 🚀 Planned Features

### Phase 1: RAG Foundation
- [ ] Chunk and embed all markdown content
- [ ] Set up vector database (e.g., Pinecone, Chroma, or local)
- [ ] Implement semantic search API
- [ ] Basic chat interface

### Phase 2: SQLite Game State
- [ ] Design schema for characters, rooms, sessions
- [ ] CRUD operations for game state
- [ ] Room exploration tracking
- [ ] Combat encounter management

### Phase 3: Web Application
- [ ] Frontend chat UI
- [ ] Character sheet management
- [ ] Map visualization
- [ ] Session persistence

### Phase 4: Advanced Features
- [ ] Multi-user sessions
- [ ] Dice rolling integration
- [ ] Encounter difficulty calculator
- [ ] Custom content support

## 📜 License

### SRD 5.2 Content
This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License (CC-BY-4.0).

### World's Largest Dungeon
The World's Largest Dungeon content is included for personal use in running the adventure. Original material © AEG/Alderac Entertainment Group.

### Application Code
Application code (when added) will be licensed under MIT.

## 🤝 Contributing

This project is in early development. Contributions welcome for:
- RAG pipeline implementation
- SQLite schema design
- Web frontend development
- Content corrections and improvements

---

*"The World's Largest Dungeon represents years of adventuring. Do not tread lightly."*
