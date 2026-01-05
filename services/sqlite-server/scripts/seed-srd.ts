/**
 * SRD 5.2 Seed Script - Populates SQLite with spells and monsters from SRD markdown
 * 
 * Source: Resources/markdown/SRD 5.2/07-Spells.md and 11-Monsters.md
 * GitHub: https://github.com/Mnehmos/The-Worlds-Largest-Dungeon/tree/master/Resources/markdown/SRD%205.2
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'wld.db');

// GitHub base URL for source references
const GITHUB_BASE = 'https://github.com/Mnehmos/The-Worlds-Largest-Dungeon/blob/master/Resources/markdown/SRD%205.2';

// ============================================================================
// Types
// ============================================================================

interface ParsedSpell {
  name: string;
  level: number;
  school: string;
  classes: string;
  casting_time: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  higher_levels: string | null;
  source: string;
}

interface ParsedMonster {
  name: string;
  cr: string;
  cr_numeric: number;
  type: string;
  size: string;
  alignment: string;
  ac: number | null;
  hp: number | null;
  speed: string;
  abilities: string | null;
  description: string;
  source: string;
}

// ============================================================================
// Spell Parsing
// ============================================================================

function parseSpells(content: string): ParsedSpell[] {
  const spells: ParsedSpell[] = [];
  
  // Find the start of spell descriptions
  const spellDescStart = content.indexOf('Spell Descriptions');
  if (spellDescStart === -1) {
    console.log('Could not find "Spell Descriptions" section');
    return spells;
  }

  const spellContent = content.substring(spellDescStart);
  
  // Pattern for spell entries - they start with a spell name on its own line
  // followed by "Level X School (Classes)" or "School Cantrip (Classes)"
  const spellPattern = /^([A-Z][a-zA-Zâ€™'\s]+)\r?\n(?:Level (\d) ([A-Za-z]+) \(([^)]+)\)|([A-Za-z]+) Cantrip \(([^)]+)\))\r?\nCasting Time: ([^\r\n]+)\r?\nRange: ([^\r\n]+)\r?\nComponents: ([^\r\n]+)\r?\nDuration: ([^\r\n]+)\r?\n([\s\S]*?)(?=\r?\n[A-Z][a-zA-Zâ€™'\s]+\r?\n(?:Level \d|[A-Za-z]+ Cantrip)|$)/gm;

  let match;
  while ((match = spellPattern.exec(spellContent)) !== null) {
    const [, name, level, school, classes, cantripSchool, cantripClasses, castingTime, range, components, duration, description] = match;
    
    // Parse the description for "Using a Higher-Level Spell Slot" or "Cantrip Upgrade"
    let descText = description.trim();
    let higherLevels: string | null = null;
    
    const higherLevelMatch = descText.match(/Using a Higher-Level Spell Slot\.\s*([\s\S]*?)(?=\r?\n[A-Z]|$)/i);
    const cantripUpgradeMatch = descText.match(/Cantrip Upgrade\.\s*([\s\S]*?)(?=\r?\n[A-Z]|$)/i);
    
    if (higherLevelMatch) {
      higherLevels = higherLevelMatch[1].trim();
      descText = descText.replace(higherLevelMatch[0], '').trim();
    } else if (cantripUpgradeMatch) {
      higherLevels = cantripUpgradeMatch[1].trim();
      descText = descText.replace(cantripUpgradeMatch[0], '').trim();
    }

    spells.push({
      name: name.trim(),
      level: level ? parseInt(level, 10) : 0,
      school: (school || cantripSchool || '').trim(),
      classes: (classes || cantripClasses || '').trim(),
      casting_time: castingTime.trim(),
      range: range.trim(),
      components: components.trim(),
      duration: duration.trim(),
      description: descText.replace(/\s+/g, ' ').trim(),
      higher_levels: higherLevels,
      source: `${GITHUB_BASE}/07-Spells.md`,
    });
  }

  return spells;
}

// Simplified alternative - just extract key spells we know about
function extractKeySpells(content: string): ParsedSpell[] {
  const spells: ParsedSpell[] = [];
  const lines = content.split('\n');
  
  let currentSpell: Partial<ParsedSpell> | null = null;
  let currentDescription: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r/g, '');
    const nextLine = lines[i + 1]?.replace(/\r/g, '') || '';
    
    // Detect spell start: Name followed by "Level X School" or "School Cantrip"
    const levelMatch = nextLine.match(/^Level (\d) ([A-Za-z]+) \(([^)]+)\)/);
    const cantripMatch = nextLine.match(/^([A-Za-z]+) Cantrip \(([^)]+)\)/);
    
    if ((levelMatch || cantripMatch) && /^[A-Z][a-zA-Zâ€™'\s]+$/.test(line.trim()) && line.trim().length > 2) {
      // Save previous spell
      if (currentSpell && currentSpell.name) {
        currentSpell.description = currentDescription.join(' ').replace(/\s+/g, ' ').trim();
        spells.push(currentSpell as ParsedSpell);
      }
      
      currentSpell = {
        name: line.trim(),
        level: levelMatch ? parseInt(levelMatch[1], 10) : 0,
        school: (levelMatch ? levelMatch[2] : cantripMatch![1]).trim(),
        classes: (levelMatch ? levelMatch[3] : cantripMatch![2]).trim(),
        casting_time: '',
        range: '',
        components: '',
        duration: '',
        description: '',
        higher_levels: null,
        source: `${GITHUB_BASE}/07-Spells.md`,
      };
      currentDescription = [];
      i++; // Skip the level line
    } else if (currentSpell) {
      // Parse spell details
      if (line.startsWith('Casting Time:')) {
        currentSpell.casting_time = line.replace('Casting Time:', '').trim();
      } else if (line.startsWith('Range:')) {
        currentSpell.range = line.replace('Range:', '').trim();
      } else if (line.startsWith('Components:')) {
        currentSpell.components = line.replace('Components:', '').trim();
      } else if (line.startsWith('Duration:')) {
        currentSpell.duration = line.replace('Duration:', '').trim();
      } else if (line.startsWith('Using a Higher-Level Spell Slot.')) {
        currentSpell.higher_levels = line.replace('Using a Higher-Level Spell Slot.', '').trim();
      } else if (line.startsWith('Cantrip Upgrade.')) {
        currentSpell.higher_levels = line.replace('Cantrip Upgrade.', '').trim();
      } else if (line.trim() && !line.startsWith('System Reference Document')) {
        // Add to description
        currentDescription.push(line.trim());
      }
    }
  }
  
  // Save last spell
  if (currentSpell && currentSpell.name) {
    currentSpell.description = currentDescription.join(' ').replace(/\s+/g, ' ').trim();
    spells.push(currentSpell as ParsedSpell);
  }
  
  return spells;
}

// ============================================================================
// Monster Parsing
// ============================================================================

function extractMonsters(content: string): ParsedMonster[] {
  const monsters: ParsedMonster[] = [];
  const lines = content.split('\n');
  
  let currentMonster: Partial<ParsedMonster> | null = null;
  let inMonsterSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r/g, '').trim();
    const nextLine = lines[i + 1]?.replace(/\r/g, '').trim() || '';
    
    // Start of monsters A-Z section
    if (line.includes('Monsters A–Z') || line.includes('Monsters A-Z')) {
      inMonsterSection = true;
      continue;
    }
    
    if (!inMonsterSection) continue;
    
    // Detect monster start: Name followed by "Size Type, Alignment"
    const sizeTypeMatch = nextLine.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)(?:\s+or\s+(?:Tiny|Small|Medium|Large|Huge|Gargantuan))?\s+([A-Za-z]+)(?:\s+\([^)]+\))?,\s*(.+)$/);
    
    if (sizeTypeMatch && /^[A-Z][a-zA-Z\s]+$/.test(line) && line.length > 2 && !line.includes('AC ')) {
      // Save previous monster
      if (currentMonster && currentMonster.name) {
        monsters.push(currentMonster as ParsedMonster);
      }
      
      currentMonster = {
        name: line,
        size: sizeTypeMatch[1],
        type: sizeTypeMatch[2],
        alignment: sizeTypeMatch[3],
        cr: '0',
        cr_numeric: 0,
        ac: null,
        hp: null,
        speed: '',
        abilities: null,
        description: '',
        source: `${GITHUB_BASE}/11-Monsters.md`,
      };
      i++; // Skip the size/type line
    } else if (currentMonster) {
      // Parse monster details
      if (line.startsWith('AC ')) {
        const acMatch = line.match(/AC\s+(\d+)/);
        if (acMatch) currentMonster.ac = parseInt(acMatch[1], 10);
      } else if (line.startsWith('HP ')) {
        const hpMatch = line.match(/HP\s+(\d+)/);
        if (hpMatch) currentMonster.hp = parseInt(hpMatch[1], 10);
      } else if (line.startsWith('Speed ')) {
        currentMonster.speed = line.replace('Speed ', '');
      } else if (line.startsWith('CR ')) {
        const crMatch = line.match(/CR\s+([\d/]+)/);
        if (crMatch) {
          currentMonster.cr = crMatch[1];
          // Convert fractional CR to numeric
          if (crMatch[1].includes('/')) {
            const [num, denom] = crMatch[1].split('/').map(Number);
            currentMonster.cr_numeric = num / denom;
          } else {
            currentMonster.cr_numeric = parseFloat(crMatch[1]);
          }
        }
      }
    }
  }
  
  // Save last monster
  if (currentMonster && currentMonster.name) {
    monsters.push(currentMonster as ParsedMonster);
  }
  
  return monsters;
}

// ============================================================================
// Database Operations
// ============================================================================

function seedSpells(db: Database.Database, spells: ParsedSpell[]): number {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO spells (name, level, school, casting_time, range, components, duration, classes, description, higher_levels, source)
    VALUES (@name, @level, @school, @casting_time, @range, @components, @duration, @classes, @description, @higher_levels, @source)
  `);
  
  const insertMany = db.transaction((spells: ParsedSpell[]) => {
    for (const spell of spells) {
      insert.run(spell);
    }
  });
  
  insertMany(spells);
  return spells.length;
}

function seedMonsters(db: Database.Database, monsters: ParsedMonster[]): number {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO monsters (name, cr, cr_numeric, type, size, alignment, ac, hp, speed, abilities, source)
    VALUES (@name, @cr, @cr_numeric, @type, @size, @alignment, @ac, @hp, @speed, @abilities, @source)
  `);
  
  const insertMany = db.transaction((monsters: ParsedMonster[]) => {
    for (const monster of monsters) {
      insert.run(monster);
    }
  });
  
  insertMany(monsters);
  return monsters.length;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🌱 Starting SRD 5.2 seed...');
  console.log(`📁 Project root: ${PROJECT_ROOT}`);
  console.log(`📁 Database path: ${DB_PATH}`);
  
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  // Open database
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  // Read spell markdown
  const spellPath = path.join(PROJECT_ROOT, 'Resources/markdown/SRD 5.2/07-Spells.md');
  console.log(`\n📖 Reading spells from: ${spellPath}`);
  
  if (fs.existsSync(spellPath)) {
    const spellContent = fs.readFileSync(spellPath, 'utf-8');
    const spells = extractKeySpells(spellContent);
    console.log(`   Found ${spells.length} spells`);
    
    if (spells.length > 0) {
      const inserted = seedSpells(db, spells);
      console.log(`   ✅ Inserted ${inserted} spells`);
    }
  } else {
    console.log('   ❌ Spell file not found');
  }
  
  // Read monster markdown
  const monsterPath = path.join(PROJECT_ROOT, 'Resources/markdown/SRD 5.2/11-Monsters.md');
  console.log(`\n📖 Reading monsters from: ${monsterPath}`);
  
  if (fs.existsSync(monsterPath)) {
    const monsterContent = fs.readFileSync(monsterPath, 'utf-8');
    const monsters = extractMonsters(monsterContent);
    console.log(`   Found ${monsters.length} monsters`);
    
    if (monsters.length > 0) {
      const inserted = seedMonsters(db, monsters);
      console.log(`   ✅ Inserted ${inserted} monsters`);
    }
  } else {
    console.log('   ❌ Monster file not found');
  }
  
  // Print summary
  const counts = {
    spells: (db.prepare('SELECT COUNT(*) as count FROM spells').get() as { count: number }).count,
    monsters: (db.prepare('SELECT COUNT(*) as count FROM monsters').get() as { count: number }).count,
  };
  
  console.log('\n📊 Database Summary:');
  console.log(`   Spells: ${counts.spells}`);
  console.log(`   Monsters: ${counts.monsters}`);
  
  db.close();
  console.log('\n✅ SRD seed complete!');
}

main().catch(console.error);
