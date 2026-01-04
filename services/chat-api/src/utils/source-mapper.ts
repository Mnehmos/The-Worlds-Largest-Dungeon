/**
 * Source URL Mapper - Transforms local file paths to web-accessible GitHub URLs
 * 
 * Converts internal source paths like "Resources/markdown/SRD 5.2/07-Spells.md"
 * to clickable GitHub blob URLs for user-facing citations.
 */

// Configuration from environment variables
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'mnehmos';
const GITHUB_REPO = process.env.GITHUB_REPO || 'The-Worlds-Largest-Dungeon';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'master';

/**
 * Base URL for GitHub blob (file) links
 */
const GITHUB_BLOB_BASE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}`;

/**
 * Base URL for GitHub tree (folder) links
 */
const GITHUB_TREE_BASE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tree/${GITHUB_BRANCH}`;

export interface SourceReference {
  type: 'rag' | 'sqlite';
  reference: string;  // Human-readable reference
  url: string;        // Clickable web URL
  text?: string;      // Full source text for modal display
  score?: number;     // Relevance score (0-1)
}

/**
 * Normalizes a path that may contain absolute Windows paths or other prefixes
 * and extracts just the relative path from the repo root.
 *
 * @param path - Path that may be absolute or relative
 * @returns Relative path from repo root (starting with Resources/)
 */
function normalizeToRelativePath(path: string): string {
  // Normalize backslashes to forward slashes
  let normalized = path.replace(/\\/g, '/');
  
  // Remove Windows drive letter prefix (e.g., C:/, D:/)
  normalized = normalized.replace(/^[a-zA-Z]:\//, '');
  
  // Find the Resources/ folder and extract from there
  const resourcesIndex = normalized.indexOf('Resources/');
  if (resourcesIndex !== -1) {
    return normalized.substring(resourcesIndex);
  }
  
  // Fallback: try to find common repo folders
  const commonFolders = ['services/', 'tools/', 'docs/', '.github/'];
  for (const folder of commonFolders) {
    const index = normalized.indexOf(folder);
    if (index !== -1) {
      return normalized.substring(index);
    }
  }
  
  // If no known prefix found, return as-is but strip any leading path segments
  // that look like user directories
  const userDirMatch = normalized.match(/\/(?:Users|home)\/[^/]+\/[^/]+\/[^/]+\/(.+)/);
  if (userDirMatch) {
    return userDirMatch[1];
  }
  
  return normalized;
}

/**
 * Maps a local file or folder path to a web-accessible GitHub URL
 *
 * @param localPath - Local path (can be absolute Windows path or relative)
 * @param isFolder - Whether the path is a folder (uses tree/) or file (uses blob/)
 * @returns Full GitHub URL with proper encoding
 *
 * @example
 * mapSourceToWebUrl("C:/Users/user/Desktop/repo/Resources/markdown/SRD 5.2/07-Spells.md")
 * // → "https://github.com/mnehmos/The-Worlds-Largest-Dungeon/blob/master/Resources/markdown/SRD%205.2/07-Spells.md"
 *
 * @example
 * mapSourceToWebUrl("Resources/markdown/World's Largest Dungeon", true)
 * // → "https://github.com/mnehmos/The-Worlds-Largest-Dungeon/tree/master/Resources/markdown/World%27s%20Largest%20Dungeon"
 */
export function mapSourceToWebUrl(localPath: string, isFolder = false): string {
  // Normalize the path to get just the relative repo path
  const relativePath = normalizeToRelativePath(localPath);
  
  // Clean the path - remove leading/trailing slashes
  const cleanPath = relativePath.replace(/^\/+|\/+$/g, '');
  
  // URL-encode each path segment separately to preserve slashes
  const encodedPath = cleanPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  
  const base = isFolder ? GITHUB_TREE_BASE : GITHUB_BLOB_BASE;
  return `${base}/${encodedPath}`;
}

/**
 * Determines if a source path is a folder or file based on extension
 */
export function isFilePath(path: string): boolean {
  const fileExtensions = ['.md', '.json', '.txt', '.pdf', '.csv', '.xml'];
  return fileExtensions.some(ext => path.toLowerCase().endsWith(ext));
}

/**
 * Creates a source reference object from RAG server source data
 * 
 * @param sourceUri - The source URI from the RAG server (folder or file path)
 * @param sourceName - Human-readable source name (optional)
 * @param chunkText - First ~100 chars of chunk for context (optional)
 */
export function createRagSourceReference(
  sourceUri: string,
  sourceName?: string | null,
  chunkText?: string
): SourceReference {
  const isFolder = !isFilePath(sourceUri);
  
  // Create human-readable reference
  let reference = sourceName || sourceUri;
  if (chunkText && chunkText.length > 20) {
    // Extract first meaningful line as additional context
    const firstLine = chunkText.split('\n')[0].replace(/^#+\s*/, '').trim();
    if (firstLine && firstLine.length > 5) {
      reference = `${reference}: ${firstLine.substring(0, 60)}${firstLine.length > 60 ? '...' : ''}`;
    }
  }
  
  return {
    type: 'rag',
    reference,
    url: mapSourceToWebUrl(sourceUri, isFolder),
  };
}

/**
 * Creates a source reference for SQLite results
 * Maps structured data back to appropriate documentation
 * 
 * @param entityType - Type of entity (spells, monsters, equipment, rooms)
 * @param entityName - Name of the specific entity
 * @param region - For rooms, the dungeon region (A, B, C, D)
 */
export function createSqliteSourceReference(
  entityType: 'spells' | 'monsters' | 'equipment' | 'rooms',
  entityName: string,
  region?: string
): SourceReference {
  let reference: string;
  let url: string;
  
  switch (entityType) {
    case 'spells':
      reference = `SRD 5.2 - Spells: ${entityName}`;
      url = mapSourceToWebUrl('Resources/markdown/SRD 5.2/07-Spells.md');
      break;
      
    case 'monsters':
      reference = `SRD 5.2 - Monsters: ${entityName}`;
      url = mapSourceToWebUrl('Resources/markdown/SRD 5.2/11-Monsters.md');
      break;
      
    case 'equipment':
      reference = `SRD 5.2 - Equipment: ${entityName}`;
      url = mapSourceToWebUrl('Resources/markdown/SRD 5.2/06-Equipment.md');
      break;
      
    case 'rooms':
      // Map room to region-specific file
      const regionMap: Record<string, string> = {
        'A': '01-Region-A.md',
        'B': '02-Region-B.md',
        'C': '03-Region-C.md',
        'D': '04-Region-D.md',
      };
      const regionFile = region ? regionMap[region.toUpperCase()] : '00-Introduction.md';
      reference = `World's Largest Dungeon - Room ${entityName}`;
      url = mapSourceToWebUrl(`Resources/markdown/World's Largest Dungeon/${regionFile || '00-Introduction.md'}`);
      break;
      
    default:
      reference = `D&D Reference: ${entityName}`;
      url = mapSourceToWebUrl('Resources/markdown/SRD 5.2', true);
  }
  
  return {
    type: 'sqlite',
    reference,
    url,
  };
}

/**
 * Get GitHub configuration for diagnostics
 */
export function getGitHubConfig(): { owner: string; repo: string; branch: string } {
  return {
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    branch: GITHUB_BRANCH,
  };
}
