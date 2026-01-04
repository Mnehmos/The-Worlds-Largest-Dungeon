/**
 * Room Parser for World's Largest Dungeon Markdown Files
 * 
 * Parses dungeon room entries from markdown files into structured data.
 * Handles the WLD format with room IDs, descriptions, encounters, treasure, etc.
 */

export interface ParsedRoom {
  room_id: string;  // e.g., "A42"
  region: string;   // A, B, C, D
  name: string | null;
  description: string;
  dimensions: string | null;
  features: string | null;
  monsters: string | null;  // JSON array of monster refs
  treasure: string | null;
  traps: string | null;
  notes: string | null;
}

/**
 * Extract region letter from room ID
 */
function extractRegion(roomId: string): string {
  const match = roomId.match(/^([A-Z])/i);
  return match ? match[1].toUpperCase() : 'A';
}

/**
 * Extract room ID and name from header
 * Examples:
 *   "A32. TORTURE CHAMBER" -> { id: "A32", name: "TORTURE CHAMBER" }
 *   "A33-A34. THE AMBUSH" -> { id: "A33-A34", name: "THE AMBUSH" }
 *   "B1. The Entry Hall (EL 2)" -> { id: "B1", name: "The Entry Hall (EL 2)" }
 *   "Room A1: Entrance" -> { id: "A1", name: "Entrance" }
 *   "Room A33-A34: The Ambush" -> { id: "A33-A34", name: "The Ambush" }
 */
function parseRoomHeader(header: string): { id: string; name: string | null } | null {
  // Pattern 1: "Room A1: Name" format (with "Room" prefix and colon)
  const roomPrefixMatch = header.match(/^Room\s+([A-Z]\d+(?:-[A-Z]?\d+)?)[:\s]+(.+)$/i);
  if (roomPrefixMatch) {
    return {
      id: roomPrefixMatch[1].toUpperCase(),
      name: roomPrefixMatch[2].trim() || null,
    };
  }
  
  // Pattern 2: "A32. TORTURE CHAMBER" format (original)
  const match = header.match(/^([A-Z]\d+(?:-[A-Z]?\d+)?)\.\s*(.+)$/i);
  if (match) {
    return {
      id: match[1].toUpperCase(),
      name: match[2].trim() || null,
    };
  }
  
  // Pattern 3: just the ID without a period
  const simpleMatch = header.match(/^([A-Z]\d+(?:-[A-Z]?\d+)?)\s+(.+)$/i);
  if (simpleMatch) {
    return {
      id: simpleMatch[1].toUpperCase(),
      name: simpleMatch[2].trim() || null,
    };
  }
  
  return null;
}

/**
 * Extract a field from content like "**Treasure:** Gold coins and gems."
 */
function extractRoomField(content: string, fieldName: string): string | null {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Z][a-z]+:|---|\n##|$)`, 'i');
  const match = content.match(pattern);
  
  if (match) {
    const value = match[1].trim();
    // Return null for N/A or empty values
    if (!value || value.toLowerCase() === 'n/a' || value === '—' || value === '-') {
      return null;
    }
    return value;
  }
  return null;
}

/**
 * Extract dimension information from description
 * Examples:
 *   "This 30-foot by 40-foot room contains..."
 *   "The 20' × 30' chamber..."
 */
function extractDimensions(text: string): string | null {
  const patterns = [
    /(\d+)[\s-]*(?:foot|ft\.?|')[\s-]*(?:by|×|x)[\s-]*(\d+)[\s-]*(?:foot|ft\.?|')/i,
    /(\d+)[\s-]*(?:feet|ft\.?)[\s-]*(?:square|wide|long)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[2]) {
        return `${match[1]} ft. × ${match[2]} ft.`;
      }
      return `${match[1]} ft.`;
    }
  }
  
  return null;
}

/**
 * Extract trap information from content
 */
function extractTraps(content: string): string | null {
  // Look for explicit trap field
  const trapField = extractRoomField(content, 'Trap');
  if (trapField) {
    return trapField;
  }
  
  // Look for trap patterns in description
  const trapPatterns = [
    /\*\*[^*]*Trap[^*]*:\*\*\s*([^*\n]+(?:\n(?!\*\*)[^\n]+)*)/gi,
    /trap\s*\(DC\s*\d+[^)]*\)/gi,
  ];
  
  const traps: string[] = [];
  for (const pattern of trapPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      traps.push(match[0].trim());
    }
  }
  
  if (traps.length > 0) {
    return traps.join('\n');
  }
  
  return null;
}

/**
 * Extract monster/creature references from content
 */
function extractMonsters(content: string): string | null {
  const monsterRefs: string[] = [];
  
  // Look for Encounter or Creatures field
  const encounter = extractRoomField(content, 'Encounter');
  const creatures = extractRoomField(content, 'Creatures');
  
  // Common monster patterns
  const monsterPatterns = [
    /(\d+)\s+([\w\s]+?)(?:s)?\s+(?:lurk|wait|hide|guard|occupy|patrol)/gi,
    /(\d+)\s+(fiendish\s+)?[\w\s]+?\s+(?:swarm|beetle|rat|snake|darkmantle)/gi,
    /troglodyte(?:s)?/gi,
    /orc(?:s)?/gi,
    /kobold(?:s)?/gi,
    /dire\s+(?:rat|wolf|bear)/gi,
    /fiendish\s+[\w]+/gi,
  ];
  
  const sourceText = [encounter, creatures, content].filter(Boolean).join('\n');
  
  for (const pattern of monsterPatterns) {
    let match;
    while ((match = pattern.exec(sourceText)) !== null) {
      const monster = match[0].trim();
      if (!monsterRefs.includes(monster)) {
        monsterRefs.push(monster);
      }
    }
  }
  
  if (monsterRefs.length > 0) {
    try {
      return JSON.stringify(monsterRefs);
    } catch {
      return monsterRefs.join(', ');
    }
  }
  
  return null;
}

/**
 * Extract main description from room content
 */
function extractDescription(content: string): string {
  // Get the text before the first field marker
  const fieldMarkers = ['**Initial Attitude:', '**Encounter:', '**Creatures:', '**Tactics:', '**Treasure:', '**Scaling:', '**Trap:', '---'];
  
  let description = content;
  
  // Find the earliest field marker
  let earliestIndex = content.length;
  for (const marker of fieldMarkers) {
    const index = content.indexOf(marker);
    if (index !== -1 && index < earliestIndex) {
      earliestIndex = index;
    }
  }
  
  description = content.substring(0, earliestIndex).trim();
  
  // Also extract any blockquote text (read-aloud text)
  const blockquoteMatch = content.match(/>\s*([^\n]+(?:\n>\s*[^\n]+)*)/);
  if (blockquoteMatch) {
    description += '\n\n[Read-aloud text]: ' + blockquoteMatch[0].replace(/^>\s*/gm, '');
  }
  
  return description.trim();
}

/**
 * Extract features from content (notable objects, furniture, etc.)
 */
function extractFeatures(content: string): string | null {
  const features: string[] = [];
  
  // Look for feature patterns
  const patterns = [
    /workbench(?:es)?/gi,
    /furnace/gi,
    /table(?:s)?/gi,
    /chest(?:s)?/gi,
    /altar/gi,
    /door(?:s)?\s+(?:is|are)\s+\w+/gi,
    /secret\s+door/gi,
    /reed\s+mats?/gi,
    /shackles/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const feature = match[0].trim();
      if (!features.includes(feature)) {
        features.push(feature);
      }
    }
  }
  
  if (features.length > 0) {
    return features.join(', ');
  }
  
  // Check for Encounter Condition which often describes room features
  const condition = extractRoomField(content, 'Encounter Condition');
  if (condition && condition.toLowerCase() !== 'n/a') {
    return condition;
  }
  
  return null;
}

/**
 * Parse all rooms from a markdown content string
 */
export function parseRooms(markdownContent: string): ParsedRoom[] {
  const rooms: ParsedRoom[] = [];
  
  // Normalize line endings (Windows CRLF -> LF)
  const normalizedContent = markdownContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Split by room headers - support both formats:
  // - "## A1. ROOM NAME" (h2, original format)
  // - "### Room A1: Name" (h3, new format with "Room" prefix)
  const roomPattern = /(?=^##+ (?:Room\s+)?[A-Z]\d+)/m;
  const roomSections = normalizedContent.split(roomPattern);

  for (const section of roomSections) {
    // Must start with ## or ### (room header)
    if (!section.match(/^##+ /)) {
      continue;
    }

    try {
      const room = parseRoomSection(section);
      if (room) {
        rooms.push(room);
      }
    } catch (error) {
      // Log error but continue parsing
      const nameMatch = section.match(/^##+ (.+?)(?:\n|$)/);
      const roomHeader = nameMatch ? nameMatch[1] : 'Unknown';
      console.warn(`Warning: Failed to parse room "${roomHeader}": ${error}`);
    }
  }

  return rooms;
}

/**
 * Parse a single room section
 */
function parseRoomSection(section: string): ParsedRoom | null {
  // Extract room header - support both ## and ### formats
  const headerMatch = section.match(/^##+ (.+?)(?:\n|$)/);
  if (!headerMatch) {
    return null;
  }
  
  const headerText = headerMatch[1].trim();
  const parsedHeader = parseRoomHeader(headerText);
  
  if (!parsedHeader) {
    // Not a room entry (might be a section header)
    return null;
  }
  
  // Get the rest of the content
  const content = section.substring(headerMatch[0].length);
  
  // Extract room data
  const description = extractDescription(content);
  const dimensions = extractDimensions(description);
  const treasure = extractRoomField(content, 'Treasure');
  const traps = extractTraps(content);
  const monsters = extractMonsters(content);
  const features = extractFeatures(content);
  
  // Compile notes from Tactics and Scaling
  const tactics = extractRoomField(content, 'Tactics');
  const scaling = extractRoomField(content, 'Scaling');
  const notes = [tactics, scaling].filter(Boolean).join('\n\n');
  
  return {
    room_id: parsedHeader.id,
    region: extractRegion(parsedHeader.id),
    name: parsedHeader.name,
    description,
    dimensions,
    features,
    monsters,
    treasure,
    traps,
    notes: notes || null,
  };
}

/**
 * CLI entry point for testing
 */
async function main() {
  const fs = await import('fs');
  const path = await import('path');
  
  // Test with a room file
  const testFile = path.join(process.cwd(), "../../Resources/markdown/World's Largest Dungeon/01c-Region-A-A32-to-A46-A56.md");
  
  if (fs.existsSync(testFile)) {
    const content = fs.readFileSync(testFile, 'utf-8');
    const rooms = parseRooms(content);
    
    console.log(`Parsed ${rooms.length} rooms from ${path.basename(testFile)}`);
    
    // Group by region
    const byRegion = rooms.reduce((acc, room) => {
      acc[room.region] = (acc[room.region] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\nBy region:');
    Object.entries(byRegion).forEach(([region, count]) => {
      console.log(`  Region ${region}: ${count} rooms`);
    });
    
    console.log('\nFirst 3 rooms:');
    rooms.slice(0, 3).forEach(room => {
      console.log(`\n- ${room.room_id}: ${room.name || 'Unnamed'}`);
      console.log(`  Region: ${room.region}`);
      console.log(`  Dimensions: ${room.dimensions || 'N/A'}`);
      console.log(`  Monsters: ${room.monsters ? 'Yes' : 'No'}`);
      console.log(`  Treasure: ${room.treasure ? 'Yes' : 'No'}`);
      console.log(`  Traps: ${room.traps ? 'Yes' : 'No'}`);
    });
  } else {
    console.log(`Test file not found: ${testFile}`);
    console.log('Run from tools/data-pipeline directory');
  }
}

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
