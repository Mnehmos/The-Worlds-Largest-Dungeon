/**
 * SRD Client - HTTP client for the 5e-srd-api
 *
 * Provides access to comprehensive D&D 5e SRD data via https://www.dnd5eapi.co/
 * Used for class features, race traits, subclasses, and other SRD content
 * not covered by the local SQLite database.
 */

const SRD_API_BASE = "https://www.dnd5eapi.co/api/2014";

// ============================================================================
// Types
// ============================================================================

export interface SrdReference {
  index: string;
  name: string;
  url: string;
}

export interface SrdSpell {
  index: string;
  name: string;
  level: number;
  school: SrdReference;
  casting_time: string;
  range: string;
  components: string[];
  duration: string;
  concentration: boolean;
  ritual: boolean;
  desc: string[];
  higher_level?: string[];
  classes: SrdReference[];
  subclasses?: SrdReference[];
}

export interface SrdMonster {
  index: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  armor_class: Array<{ type: string; value: number }>;
  hit_points: number;
  hit_dice: string;
  speed: Record<string, string>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  challenge_rating: number;
  xp: number;
  actions?: Array<{ name: string; desc: string }>;
  special_abilities?: Array<{ name: string; desc: string }>;
}

export interface SrdClass {
  index: string;
  name: string;
  hit_die: number;
  proficiency_choices: Array<{
    desc: string;
    choose: number;
    from: { options: Array<{ item: SrdReference }> };
  }>;
  proficiencies: SrdReference[];
  saving_throws: SrdReference[];
  starting_equipment: Array<{ equipment: SrdReference; quantity: number }>;
  class_levels: string;
  subclasses: SrdReference[];
  spellcasting?: {
    level: number;
    spellcasting_ability: SrdReference;
  };
}

export interface SrdRace {
  index: string;
  name: string;
  speed: number;
  ability_bonuses: Array<{ ability_score: SrdReference; bonus: number }>;
  size: string;
  size_description: string;
  languages: SrdReference[];
  language_desc: string;
  traits: SrdReference[];
  subraces: SrdReference[];
}

export interface SrdClassLevel {
  level: number;
  ability_score_bonuses: number;
  prof_bonus: number;
  features: SrdReference[];
  class_specific?: Record<string, number | string>;
}

export interface ProcessedSrdResult {
  type:
    | "spell"
    | "monster"
    | "class"
    | "race"
    | "class_level"
    | "feature"
    | "trait";
  name: string;
  formattedText: string;
  source: {
    title: string;
    url: string;
    type: "srd";
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Make a request to the 5e-srd-api
 */
async function srdFetch<T>(endpoint: string): Promise<T | null> {
  try {
    const url = `${SRD_API_BASE}${endpoint}`;
    console.log(`[SRD] Fetching: ${url}`);

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[SRD] Not found: ${endpoint}`);
        return null;
      }
      throw new Error(`SRD API error: ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`[SRD] Fetch error for ${endpoint}:`, error);
    return null;
  }
}

/**
 * Convert a name to SRD index format (lowercase, hyphenated)
 */
function nameToIndex(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ============================================================================
// Spell Functions
// ============================================================================

/**
 * Get a single spell by name or index
 */
export async function getSrdSpell(
  nameOrIndex: string
): Promise<ProcessedSrdResult | null> {
  const index = nameToIndex(nameOrIndex);
  const spell = await srdFetch<SrdSpell>(`/spells/${index}`);

  if (!spell) return null;

  return {
    type: "spell",
    name: spell.name,
    formattedText: formatSpell(spell),
    source: {
      title: `${spell.name} (5e SRD)`,
      url: `https://www.dnd5eapi.co/api/2014/spells/${spell.index}`,
      type: "srd",
    },
  };
}

function formatSpell(spell: SrdSpell): string {
  const lines = [
    `**${spell.name}**`,
    `*Level ${spell.level} ${spell.school.name}${
      spell.ritual ? " (ritual)" : ""
    }*`,
    "",
    `**Casting Time:** ${spell.casting_time}`,
    `**Range:** ${spell.range}`,
    `**Components:** ${spell.components.join(", ")}`,
    `**Duration:** ${spell.concentration ? "Concentration, " : ""}${
      spell.duration
    }`,
    "",
    ...spell.desc,
  ];

  if (spell.higher_level?.length) {
    lines.push("", "**At Higher Levels:**", ...spell.higher_level);
  }

  if (spell.classes?.length) {
    lines.push(
      "",
      `**Classes:** ${spell.classes.map((c) => c.name).join(", ")}`
    );
  }

  return lines.join("\n");
}

// ============================================================================
// Monster Functions
// ============================================================================

/**
 * Get a single monster by name or index
 */
export async function getSrdMonster(
  nameOrIndex: string
): Promise<ProcessedSrdResult | null> {
  const index = nameToIndex(nameOrIndex);
  const monster = await srdFetch<SrdMonster>(`/monsters/${index}`);

  if (!monster) return null;

  return {
    type: "monster",
    name: monster.name,
    formattedText: formatMonster(monster),
    source: {
      title: `${monster.name} (5e SRD)`,
      url: `https://www.dnd5eapi.co/api/2014/monsters/${monster.index}`,
      type: "srd",
    },
  };
}

function formatMonster(monster: SrdMonster): string {
  const ac = monster.armor_class[0];
  const lines = [
    `**${monster.name}**`,
    `*${monster.size} ${monster.type}, ${monster.alignment}*`,
    "",
    `**Armor Class:** ${ac.value} (${ac.type})`,
    `**Hit Points:** ${monster.hit_points} (${monster.hit_dice})`,
    `**Speed:** ${Object.entries(monster.speed)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
    "",
    `| STR | DEX | CON | INT | WIS | CHA |`,
    `|-----|-----|-----|-----|-----|-----|`,
    `| ${monster.strength} | ${monster.dexterity} | ${monster.constitution} | ${monster.intelligence} | ${monster.wisdom} | ${monster.charisma} |`,
    "",
    `**Challenge:** ${monster.challenge_rating} (${monster.xp} XP)`,
  ];

  if (monster.special_abilities?.length) {
    lines.push("", "**Special Abilities:**");
    for (const ability of monster.special_abilities) {
      lines.push(`- **${ability.name}.** ${ability.desc}`);
    }
  }

  if (monster.actions?.length) {
    lines.push("", "**Actions:**");
    for (const action of monster.actions) {
      lines.push(`- **${action.name}.** ${action.desc}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Class Functions
// ============================================================================

/**
 * Get a class by name or index
 */
export async function getSrdClass(
  nameOrIndex: string
): Promise<ProcessedSrdResult | null> {
  const index = nameToIndex(nameOrIndex);
  const cls = await srdFetch<SrdClass>(`/classes/${index}`);

  if (!cls) return null;

  return {
    type: "class",
    name: cls.name,
    formattedText: formatClass(cls),
    source: {
      title: `${cls.name} (5e SRD)`,
      url: `https://www.dnd5eapi.co/api/2014/classes/${cls.index}`,
      type: "srd",
    },
  };
}

function formatClass(cls: SrdClass): string {
  const lines = [
    `**${cls.name}**`,
    "",
    `**Hit Die:** d${cls.hit_die}`,
    `**Saving Throws:** ${cls.saving_throws.map((s) => s.name).join(", ")}`,
    `**Proficiencies:** ${cls.proficiencies.map((p) => p.name).join(", ")}`,
  ];

  if (cls.subclasses?.length) {
    lines.push(
      `**Subclasses:** ${cls.subclasses.map((s) => s.name).join(", ")}`
    );
  }

  if (cls.spellcasting) {
    lines.push(
      `**Spellcasting:** Yes (${cls.spellcasting.spellcasting_ability.name})`
    );
  }

  return lines.join("\n");
}

/**
 * Get class features at a specific level
 */
export async function getSrdClassLevel(
  className: string,
  level: number
): Promise<ProcessedSrdResult | null> {
  const classIndex = nameToIndex(className);
  const levelData = await srdFetch<SrdClassLevel>(
    `/classes/${classIndex}/levels/${level}`
  );

  if (!levelData) return null;

  // Fetch feature details
  const features: string[] = [];
  for (const featureRef of levelData.features) {
    const feature = await srdFetch<{ name: string; desc: string[] }>(
      featureRef.url.replace("/api/2014", "")
    );
    if (feature) {
      features.push(`**${feature.name}:** ${feature.desc.join(" ")}`);
    }
  }

  const lines = [
    `**${className} Level ${level}**`,
    "",
    `**Proficiency Bonus:** +${levelData.prof_bonus}`,
  ];

  if (features.length) {
    lines.push("", "**Features:**");
    lines.push(...features.map((f) => `- ${f}`));
  }

  if (levelData.class_specific) {
    lines.push("", "**Class Specific:**");
    for (const [key, value] of Object.entries(levelData.class_specific)) {
      const formattedKey = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      lines.push(`- ${formattedKey}: ${value}`);
    }
  }

  return {
    type: "class_level",
    name: `${className} Level ${level}`,
    formattedText: lines.join("\n"),
    source: {
      title: `${className} Level ${level} (5e SRD)`,
      url: `https://www.dnd5eapi.co/api/2014/classes/${classIndex}/levels/${level}`,
      type: "srd",
    },
  };
}

// ============================================================================
// Race Functions
// ============================================================================

/**
 * Get a race by name or index
 */
export async function getSrdRace(
  nameOrIndex: string
): Promise<ProcessedSrdResult | null> {
  const index = nameToIndex(nameOrIndex);
  const race = await srdFetch<SrdRace>(`/races/${index}`);

  if (!race) return null;

  return {
    type: "race",
    name: race.name,
    formattedText: formatRace(race),
    source: {
      title: `${race.name} (5e SRD)`,
      url: `https://www.dnd5eapi.co/api/2014/races/${race.index}`,
      type: "srd",
    },
  };
}

function formatRace(race: SrdRace): string {
  const lines = [
    `**${race.name}**`,
    "",
    `**Speed:** ${race.speed} ft.`,
    `**Size:** ${race.size}. ${race.size_description}`,
    "",
    `**Ability Score Increases:** ${race.ability_bonuses
      .map((b) => `${b.ability_score.name} +${b.bonus}`)
      .join(", ")}`,
    "",
    `**Languages:** ${race.languages.map((l) => l.name).join(", ")}`,
  ];

  if (race.traits?.length) {
    lines.push(`**Traits:** ${race.traits.map((t) => t.name).join(", ")}`);
  }

  if (race.subraces?.length) {
    lines.push(`**Subraces:** ${race.subraces.map((s) => s.name).join(", ")}`);
  }

  return lines.join("\n");
}

// ============================================================================
// Search Functions
// ============================================================================

interface SrdListResponse {
  count: number;
  results: SrdReference[];
}

/**
 * Search spells with optional filters
 */
export async function searchSrdSpells(params: {
  name?: string;
  level?: number;
  school?: string;
}): Promise<ProcessedSrdResult[]> {
  const queryParams = new URLSearchParams();
  if (params.name) queryParams.set("name", params.name);
  if (params.level !== undefined)
    queryParams.set("level", params.level.toString());
  if (params.school) queryParams.set("school", params.school);

  const endpoint = `/spells${
    queryParams.toString() ? "?" + queryParams.toString() : ""
  }`;
  const list = await srdFetch<SrdListResponse>(endpoint);

  if (!list || !list.results.length) return [];

  // Get details for top 5 results
  const results: ProcessedSrdResult[] = [];
  for (const ref of list.results.slice(0, 5)) {
    const result = await getSrdSpell(ref.index);
    if (result) results.push(result);
  }

  return results;
}

/**
 * Search monsters with optional filters
 */
export async function searchSrdMonsters(params: {
  name?: string;
  challenge_rating?: number;
}): Promise<ProcessedSrdResult[]> {
  const queryParams = new URLSearchParams();
  if (params.name) queryParams.set("name", params.name);
  if (params.challenge_rating !== undefined) {
    queryParams.set("challenge_rating", params.challenge_rating.toString());
  }

  const endpoint = `/monsters${
    queryParams.toString() ? "?" + queryParams.toString() : ""
  }`;
  const list = await srdFetch<SrdListResponse>(endpoint);

  if (!list || !list.results.length) return [];

  // Get details for top 5 results
  const results: ProcessedSrdResult[] = [];
  for (const ref of list.results.slice(0, 5)) {
    const result = await getSrdMonster(ref.index);
    if (result) results.push(result);
  }

  return results;
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check if the 5e-srd-api is accessible
 */
export async function checkSrdHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${SRD_API_BASE}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Build context string from SRD results
 */
export function buildSrdContext(results: ProcessedSrdResult[]): string {
  if (results.length === 0) return "";

  return results
    .map((r, i) => `[SRD ${i + 1}] ${r.formattedText}`)
    .join("\n\n---\n\n");
}
