/**
 * WLD Seed Script - Populates SQLite with room data from World's Largest Dungeon markdown
 * 
 * Source: Resources/markdown/World's Largest Dungeon/01-Region-A.md etc.
 * GitHub: https://github.com/Mnehmos/The-Worlds-Largest-Dungeon/tree/master/Resources/markdown/World%27s%20Largest%20Dungeon
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'wld.db');
const WLD_DIR = path.join(PROJECT_ROOT, "Resources/markdown/World's Largest Dungeon");

// GitHub base URL for source references
const GITHUB_BASE = 'https://github.com/Mnehmos/The-Worlds-Largest-Dungeon/blob/master/Resources/markdown/World%27s%20Largest%20Dungeon';

// ============================================================================
// Types
// ============================================================================

interface ParsedRoom {
  room_id: string;
  region: string;
  name: string | null;
  description: string | null;
  dimensions: string | null;
  features: string | null;
  monsters: string; // JSON string of monster array
  treasure: string | null;
  traps: string | null;
  notes: string | null;
}

// ============================================================================
// Room Parsing
// ============================================================================

function parseRooms(content: string, sourceFile: string): ParsedRoom[] {
  const rooms: ParsedRoom[] = [];
  const lines = content.split('\n');
  
  let currentRoom: Partial<ParsedRoom> | null = null;
  let currentSection = '';
  let sectionContent: string[] = [];
  
  // Pattern for room headers like "Room A1: Name" or "## Room A1" or "A1: Name"
  const roomHeaderPattern = /^#+\s*(?:Room\s+)?([A-D][\d]+)(?:[:\s]+(.+))?$/i;
  const altRoomPattern = /^([A-D][\d]+)(?:[:\s]+(.+))?$/i;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r/g, '');
    
    // Check for room header
    const roomMatch = line.match(roomHeaderPattern) || line.match(altRoomPattern);
    
    if (roomMatch) {
      // Save previous room
      if (currentRoom && currentRoom.room_id) {
        finishSection(currentRoom, currentSection, sectionContent);
        rooms.push(currentRoom as ParsedRoom);
      }
      
      const roomId = roomMatch[1].toUpperCase();
      const region = roomId.charAt(0);
      
      currentRoom = {
        room_id: roomId,
        region: region,
        name: roomMatch[2]?.trim() || null,
        description: null,
        dimensions: null,
        features: null,
        monsters: '[]',
        treasure: null,
        traps: null,
        notes: null,
      };
      currentSection = 'description';
      sectionContent = [];
    } else if (currentRoom) {
      // Detect section headers
      const sectionMatch = line.match(/^\*\*([A-Za-z\s]+):\*\*\s*(.*)/i);
      const altSectionMatch = line.match(/^([A-Za-z]+):\s*(.*)/i);
      
      if (sectionMatch || altSectionMatch) {
        // Save previous section
        finishSection(currentRoom, currentSection, sectionContent);
        
        const match = sectionMatch || altSectionMatch;
        const sectionName = match![1].toLowerCase().trim();
        const sectionValue = match![2].trim();
        
        // Map section names
        if (sectionName.includes('monster') || sectionName.includes('creature') || sectionName.includes('enemy')) {
          currentSection = 'monsters';
        } else if (sectionName.includes('treasure') || sectionName.includes('loot')) {
          currentSection = 'treasure';
        } else if (sectionName.includes('trap')) {
          currentSection = 'traps';
        } else if (sectionName.includes('dimension') || sectionName.includes('size')) {
          currentSection = 'dimensions';
        } else if (sectionName.includes('feature')) {
          currentSection = 'features';
        } else if (sectionName.includes('note') || sectionName.includes('development') || sectionName.includes('tactic')) {
          currentSection = 'notes';
        } else {
          currentSection = 'description';
        }
        
        sectionContent = sectionValue ? [sectionValue] : [];
      } else if (line.trim() && !line.startsWith('System Reference') && !line.match(/^\d+$/)) {
        // Add to current section
        sectionContent.push(line.trim());
      }
    }
  }
  
  // Save last room
  if (currentRoom && currentRoom.room_id) {
    finishSection(currentRoom, currentSection, sectionContent);
    rooms.push(currentRoom as ParsedRoom);
  }
  
  return rooms;
}

function finishSection(room: Partial<ParsedRoom>, section: string, content: string[]) {
  const text = content.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return;
  
  switch (section) {
    case 'description':
      room.description = text;
      break;
    case 'dimensions':
      room.dimensions = text;
      break;
    case 'features':
      room.features = text;
      break;
    case 'monsters':
      // Parse monster list
      const monsters = text.split(/[,;]/).map(m => {
        const countMatch = m.match(/(\d+)\s*[xX]?\s*(.+)/);
        if (countMatch) {
          return { name: countMatch[2].trim(), count: parseInt(countMatch[1], 10) };
        }
        return { name: m.trim() };
      }).filter(m => m.name.length > 0);
      room.monsters = JSON.stringify(monsters);
      break;
    case 'treasure':
      room.treasure = text;
      break;
    case 'traps':
      room.traps = text;
      break;
    case 'notes':
      room.notes = text;
      break;
  }
}

// Alternative simpler approach: just extract room IDs and full text
function extractRoomsSimple(content: string, region: string): ParsedRoom[] {
  const rooms: ParsedRoom[] = [];
  
  // Split by room headers
  const roomPattern = new RegExp(`(?:^|\\n)(?:#+\\s*)?(?:Room\\s+)?(${region}\\d+)(?:[:\\s]+([^\\n]*))?`, 'gi');
  const matches = [...content.matchAll(roomPattern)];
  
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const nextMatch = matches[i + 1];
    const roomId = match[1].toUpperCase();
    const name = match[2]?.trim() || null;
    
    // Get content between this match and next
    const startIdx = match.index! + match[0].length;
    const endIdx = nextMatch ? nextMatch.index! : content.length;
    const roomContent = content.substring(startIdx, endIdx).trim();
    
    // Extract sections from content
    let description = '';
    let monsters: { name: string; count?: number }[] = [];
    let treasure = '';
    let traps = '';
    let features = '';
    
    // Look for key sections
    const monstersMatch = roomContent.match(/\*\*(?:Monsters?|Creatures?|Enemies?):\*\*\s*([^\n*]+)/i);
    const treasureMatch = roomContent.match(/\*\*(?:Treasure|Loot):\*\*\s*([^\n*]+)/i);
    const trapsMatch = roomContent.match(/\*\*(?:Traps?):\*\*\s*([^\n*]+)/i);
    const featuresMatch = roomContent.match(/\*\*(?:Features?):\*\*\s*([^\n*]+)/i);
    
    if (monstersMatch) {
      const monsterText = monstersMatch[1].trim();
      monsters = monsterText.split(/[,;]/).map(m => {
        const countMatch = m.trim().match(/(\d+)\s*[xX]?\s*(.+)/);
        if (countMatch) {
          return { name: countMatch[2].trim(), count: parseInt(countMatch[1], 10) };
        }
        return { name: m.trim() };
      }).filter(m => m.name.length > 0 && m.name !== 'None');
    }
    
    if (treasureMatch) treasure = treasureMatch[1].trim();
    if (trapsMatch) traps = trapsMatch[1].trim();
    if (featuresMatch) features = featuresMatch[1].trim();
    
    // Get first paragraph as description
    const firstPara = roomContent.split('\n\n')[0]?.replace(/\*\*[^*]+:\*\*[^\n]+/g, '').trim();
    description = firstPara?.substring(0, 500) || '';
    
    rooms.push({
      room_id: roomId,
      region: region,
      name: name,
      description: description || null,
      dimensions: null,
      features: features || null,
      monsters: JSON.stringify(monsters),
      treasure: treasure || null,
      traps: traps || null,
      notes: null,
    });
  }
  
  return rooms;
}

// ============================================================================
// Database Operations
// ============================================================================

function seedRooms(db: Database.Database, rooms: ParsedRoom[]): number {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO rooms (room_id, region, name, description, dimensions, features, monsters, treasure, traps, notes)
    VALUES (@room_id, @region, @name, @description, @dimensions, @features, @monsters, @treasure, @traps, @notes)
  `);
  
  const insertMany = db.transaction((rooms: ParsedRoom[]) => {
    for (const room of rooms) {
      insert.run(room);
    }
  });
  
  insertMany(rooms);
  return rooms.length;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🌱 Starting WLD room seed...');
  console.log(`📁 Project root: ${PROJECT_ROOT}`);
  console.log(`📁 WLD directory: ${WLD_DIR}`);
  console.log(`📁 Database path: ${DB_PATH}`);
  
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  // Open database
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  // Process each region file
  const regionFiles = [
    { file: '01-Region-A.md', region: 'A' },
    { file: '02-Region-B.md', region: 'B' },
    { file: '03-Region-C.md', region: 'C' },
    { file: '04-Region-D.md', region: 'D' },
  ];
  
  let totalRooms = 0;
  
  for (const { file, region } of regionFiles) {
    const filePath = path.join(WLD_DIR, file);
    console.log(`\n📖 Reading ${file}...`);
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const rooms = extractRoomsSimple(content, region);
      console.log(`   Found ${rooms.length} rooms in Region ${region}`);
      
      if (rooms.length > 0) {
        const inserted = seedRooms(db, rooms);
        totalRooms += inserted;
        console.log(`   ✅ Inserted ${inserted} rooms`);
      }
    } else {
      console.log(`   ❌ File not found: ${filePath}`);
    }
  }
  
  // Print summary
  const counts = {
    rooms: (db.prepare('SELECT COUNT(*) as count FROM rooms').get() as { count: number }).count,
    byRegion: db.prepare('SELECT region, COUNT(*) as count FROM rooms GROUP BY region').all() as { region: string; count: number }[],
  };
  
  console.log('\n📊 Database Summary:');
  console.log(`   Total Rooms: ${counts.rooms}`);
  for (const { region, count } of counts.byRegion) {
    console.log(`     Region ${region}: ${count} rooms`);
  }
  
  db.close();
  console.log('\n✅ WLD room seed complete!');
}

main().catch(console.error);
