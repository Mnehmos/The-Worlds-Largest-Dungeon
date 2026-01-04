import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Static site generation for GitHub Pages
  output: 'static',
  
  // Site URL for GitHub Pages
  site: process.env.SITE_URL || 'https://mnehmos.github.io',
  
  // Base path for GitHub Pages deployment
  // Repository name must match for assets to load correctly
  base: process.env.BASE_PATH || '/The-Worlds-Largest-Dungeon/',
  
  // Build configuration
  build: {
    // Output assets with hashed filenames for cache busting
    assets: 'assets',
  },
  
  // Vite configuration
  vite: {
    define: {
      // Make environment variables available to client-side code
      'import.meta.env.CHAT_API_URL': JSON.stringify(
        process.env.CHAT_API_URL || 'http://localhost:8080'
      ),
    },
  },
});
