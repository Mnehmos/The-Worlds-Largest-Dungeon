/**
 * SQLite Server Client - Interfaces with the D&D data SQLite server
 * 
 * Endpoints:
 * - GET /spells - Query spells with filters
 * - GET /monsters - Query monsters with filters
 * - GET /equipment - Query equipment with filters
 * - GET /rooms - Query dungeon rooms with filters
 * - GET /health - Health check
 */

import { createSqliteSourceReference, type SourceReference } from '../utils/source-mapper.js';

const SQLITE_SERVER_URL = process.env.SQLITE_SERVER_URL || 'http://localhost:3000';

// ============================================================================
// Types
// ============================================================================

export interface Spell {
  id: number;
  name: string;
  level: number;
  school: string;
  casting_time: string | null;
  range: string | null;
  components: string | null;
  duration: string | null;
  classes: string[];
  description: string | null;
  higher_levels: string | null;
  source: string | null;
}

export interface Monster {
  id: number;
  name: string;
  size: string | null;
  type: string | null;
  alignment: string | null;
  cr: string | null;
  ac: number | null;
  hp: string | null;
  speed: string | null;
  abilities: Record<string, number> | null;
  description: string | null;
  source: string | null;
}

export interface Equipment {
  id: number;
  name: string;
  type: string | null;
  cost: string | null;
  weight: string | null;
  description: string | null;
  properties: string | null;
  source: string | null;
}

export interface Room {
  id: number;
  room_id: string;
  region: string;
  name: string | null;
  description: string | null;
  dimensions: string | null;
  features: string | null;
  monsters: Array<{ name: string; count?: number }>;
  treasure: string | null;
  traps: string | null;
  notes: string | null;
}

export interface PaginatedResponse<T> {
  count: number;
  limit: number;
  offset: number;
  data: T[];
}

export interface SqliteHealthResponse {
  status: string;
  tables: Record<string, number>;
}

export interface ProcessedSqliteResult {
  entityType: 'spells' | 'monsters' | 'equipment' | 'rooms';
  data: Spell | Monster | Equipment | Room;
  source: SourceReference;
  formattedText: string;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Query spells from SQLite server
 */
export async function querySpells(params: {
  level?: number;
  school?: string;
  class?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ProcessedSqliteResult[]> {
  const url = new URL(`${SQLITE_SERVER_URL}/spells`);
  
  if (params.level !== undefined) url.searchParams.set('level', params.level.toString());
  if (params.school) url.searchParams.set('school', params.school);
  if (params.class) url.searchParams.set('class', params.class);
  if (params.search) url.searchParams.set('search', params.search);
  if (params.limit) url.searchParams.set('limit', params.limit.toString());
  if (params.offset) url.searchParams.set('offset', params.offset.toString());
  
  console.log(`[SQLiteClient] querySpells URL: ${url.toString()}`);
  
  try {
    const response = await fetch(url.toString());
    
    console.log(`[SQLiteClient] querySpells response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SQLiteClient] querySpells error: ${response.status} - ${errorText}`);
      throw new Error(`SQLite spells query failed: ${response.status}`);
    }
    
    const data = await response.json() as PaginatedResponse<Spell>;
    
    console.log(`[SQLiteClient] querySpells returned ${data.data.length} spells`);
    
    return data.data.map(spell => ({
      entityType: 'spells' as const,
      data: spell,
      source: createSqliteSourceReference('spells', spell.name),
      formattedText: formatSpell(spell),
    }));
  } catch (error) {
    console.error(`[SQLiteClient] querySpells exception:`, error);
    throw error;
  }
}

/**
 * Query monsters from SQLite server
 */
export async function queryMonsters(params: {
  cr?: string;
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ProcessedSqliteResult[]> {
  const url = new URL(`${SQLITE_SERVER_URL}/monsters`);
  
  if (params.cr) url.searchParams.set('cr', params.cr);
  if (params.type) url.searchParams.set('type', params.type);
  if (params.search) url.searchParams.set('search', params.search);
  if (params.limit) url.searchParams.set('limit', params.limit.toString());
  if (params.offset) url.searchParams.set('offset', params.offset.toString());
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SQLite monsters query failed: ${response.status}`);
  }
  
  const data = await response.json() as PaginatedResponse<Monster>;
  
  return data.data.map(monster => ({
    entityType: 'monsters' as const,
    data: monster,
    source: createSqliteSourceReference('monsters', monster.name),
    formattedText: formatMonster(monster),
  }));
}

/**
 * Query equipment from SQLite server
 */
export async function queryEquipment(params: {
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ProcessedSqliteResult[]> {
  const url = new URL(`${SQLITE_SERVER_URL}/equipment`);
  
  if (params.type) url.searchParams.set('type', params.type);
  if (params.search) url.searchParams.set('search', params.search);
  if (params.limit) url.searchParams.set('limit', params.limit.toString());
  if (params.offset) url.searchParams.set('offset', params.offset.toString());
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SQLite equipment query failed: ${response.status}`);
  }
  
  const data = await response.json() as PaginatedResponse<Equipment>;
  
  return data.data.map(item => ({
    entityType: 'equipment' as const,
    data: item,
    source: createSqliteSourceReference('equipment', item.name),
    formattedText: formatEquipment(item),
  }));
}

/**
 * Query rooms from SQLite server
 */
export async function queryRooms(params: {
  region?: string;
  id?: string;
  search?: string;
  has_monsters?: boolean;
  has_traps?: boolean;
  has_treasure?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ProcessedSqliteResult[]> {
  const url = new URL(`${SQLITE_SERVER_URL}/rooms`);
  
  if (params.region) url.searchParams.set('region', params.region);
  if (params.id) url.searchParams.set('id', params.id);
  if (params.search) url.searchParams.set('search', params.search);
  if (params.has_monsters !== undefined) url.searchParams.set('has_monsters', params.has_monsters.toString());
  if (params.has_traps !== undefined) url.searchParams.set('has_traps', params.has_traps.toString());
  if (params.has_treasure !== undefined) url.searchParams.set('has_treasure', params.has_treasure.toString());
  if (params.limit) url.searchParams.set('limit', params.limit.toString());
  if (params.offset) url.searchParams.set('offset', params.offset.toString());
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SQLite rooms query failed: ${response.status}`);
  }
  
  const data = await response.json() as PaginatedResponse<Room>;
  
  return data.data.map(room => ({
    entityType: 'rooms' as const,
    data: room,
    source: createSqliteSourceReference('rooms', room.room_id, room.region),
    formattedText: formatRoom(room),
  }));
}

/**
 * Get a specific room by ID
 */
export async function getRoom(roomId: string): Promise<ProcessedSqliteResult | null> {
  const response = await fetch(`${SQLITE_SERVER_URL}/rooms/${encodeURIComponent(roomId)}`);
  
  if (response.status === 404) {
    return null;
  }
  
  if (!response.ok) {
    throw new Error(`SQLite room fetch failed: ${response.status}`);
  }
  
  const room = await response.json() as Room;
  
  return {
    entityType: 'rooms',
    data: room,
    source: createSqliteSourceReference('rooms', room.room_id, room.region),
    formattedText: formatRoom(room),
  };
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check SQLite server health status
 */
export async function checkSqliteHealth(): Promise<SqliteHealthResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${SQLITE_SERVER_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json() as SqliteHealthResponse;
  } catch (error) {
    console.error('SQLite health check failed:', error);
    return null;
  }
}

// ============================================================================
// Formatting Functions
// ============================================================================

function formatSpell(spell: Spell): string {
  const lines = [
    `**${spell.name}**`,
    `*Level ${spell.level} ${spell.school}*`,
    '',
  ];
  
  if (spell.casting_time) lines.push(`**Casting Time:** ${spell.casting_time}`);
  if (spell.range) lines.push(`**Range:** ${spell.range}`);
  if (spell.components) lines.push(`**Components:** ${spell.components}`);
  if (spell.duration) lines.push(`**Duration:** ${spell.duration}`);
  if (spell.classes.length > 0) lines.push(`**Classes:** ${spell.classes.join(', ')}`);
  
  if (spell.description) {
    lines.push('', spell.description);
  }
  
  if (spell.higher_levels) {
    lines.push('', `**At Higher Levels:** ${spell.higher_levels}`);
  }
  
  return lines.join('\n');
}

function formatMonster(monster: Monster): string {
  const lines = [
    `**${monster.name}**`,
    `*${monster.size || 'Unknown'} ${monster.type || 'creature'}, ${monster.alignment || 'unaligned'}*`,
    '',
  ];
  
  if (monster.ac) lines.push(`**AC:** ${monster.ac}`);
  if (monster.hp) lines.push(`**HP:** ${monster.hp}`);
  if (monster.speed) lines.push(`**Speed:** ${monster.speed}`);
  if (monster.cr) lines.push(`**CR:** ${monster.cr}`);
  
  if (monster.description) {
    lines.push('', monster.description);
  }
  
  return lines.join('\n');
}

function formatEquipment(item: Equipment): string {
  const lines = [
    `**${item.name}**`,
  ];
  
  if (item.type) lines.push(`*${item.type}*`);
  
  const details = [];
  if (item.cost) details.push(`Cost: ${item.cost}`);
  if (item.weight) details.push(`Weight: ${item.weight}`);
  if (details.length > 0) lines.push(details.join(' | '));
  
  if (item.properties) lines.push(`**Properties:** ${item.properties}`);
  if (item.description) lines.push('', item.description);
  
  return lines.join('\n');
}

function formatRoom(room: Room): string {
  const lines = [
    `**Room ${room.room_id}${room.name ? `: ${room.name}` : ''}**`,
    `*Region ${room.region}*`,
    '',
  ];
  
  if (room.dimensions) lines.push(`**Dimensions:** ${room.dimensions}`);
  if (room.description) lines.push(room.description);
  if (room.features) lines.push(`\n**Features:** ${room.features}`);
  
  if (room.monsters.length > 0) {
    const monsterList = room.monsters.map(m => 
      m.count && m.count > 1 ? `${m.count}x ${m.name}` : m.name
    ).join(', ');
    lines.push(`\n**Monsters:** ${monsterList}`);
  }
  
  if (room.treasure) lines.push(`\n**Treasure:** ${room.treasure}`);
  if (room.traps) lines.push(`\n**Traps:** ${room.traps}`);
  if (room.notes) lines.push(`\n**Notes:** ${room.notes}`);
  
  return lines.join('\n');
}

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build context string from SQLite results for LLM consumption
 */
export function buildSqliteContext(results: ProcessedSqliteResult[]): string {
  if (results.length === 0) {
    return 'No relevant data found in SQLite database.';
  }
  
  return results
    .map((result, index) => {
      const sourceRef = `[SQLite Source ${index + 1}: ${result.source.reference}]`;
      return `${sourceRef}\n${result.formattedText}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Get the configured SQLite server URL for diagnostics
 */
export function getSqliteServerUrl(): string {
  return SQLITE_SERVER_URL;
}
