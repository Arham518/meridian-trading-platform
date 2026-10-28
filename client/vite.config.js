import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API = process.env.VITE_API_TARGET || 'http://localhost:4000';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/uploads': { target: API, changeOrigin: true },
      '/socket.io': { target: API, ws: true, changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1100,
    // index.html must never preload the 3D or chart libraries; lazy routes still preload what they import
    modulePreload: { resolveDependencies: (file, deps, { hostType }) => (hostType === 'html' ? deps.filter((d) => !/three|charts/.test(d)) : deps) },
    rollupOptions: {
      output: {
        // Only isolate the heavy libraries. Anything else (zustand, small helpers) stays with the code that imports it,
        // so the 3D chunk is never pulled in by the entry. (The old rule matched ids containing "three" and let shared
        // modules such as zustand land inside the three.js chunk, which made every page preload ~1 MB.)
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](three|@react-three|three-stdlib|postprocessing|maath|camera-controls|troika-[^\\/]+|meshline|stats-gl|three-mesh-bvh|@monogrid)[\\/]/.test(id)) return 'three';
          if (/[\\/]node_modules[\\/]lightweight-charts|fancy-canvas[\\/]/.test(id)) return 'charts';
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return 'motion';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|zustand|use-sync-external-store)[\\/]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  // dev server: fill the placeholders that the production server replaces (APP_URL, site name)
  plugins: [react(), tailwindcss(),
    // build: preload the two self-hosted display fonts (Michroma, Anton) so the hero headline paints in its final face,
    // plus the landing chunk
    { name: 'meridian-font-preload', apply: 'build', transformIndexHtml: { order: 'post', handler: (html, ctx) => {
      const fonts = Object.keys(ctx.bundle || {}).filter((f) => /(michroma|anton)-latin-400-normal-[^/]+\.woff2$/.test(f));
      // the landing page is the usual entry point: fetch its lazy chunk in parallel with the main bundle instead of after it
      const landing = Object.keys(ctx.bundle || {}).filter((f) => /^assets\/Landing-[^/]+\.js$/.test(f));
      return { html, tags: [
        ...fonts.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${f}`, crossorigin: '' }, injectTo: 'head' })),
        ...landing.map((f) => ({ tag: 'link', attrs: { rel: 'modulepreload', href: `/${f}`, crossorigin: '' }, injectTo: 'head' })),
      ] };
    } } },
    { name: 'meridian-html-placeholders', apply: 'serve', transformIndexHtml: (html) => html.replaceAll('__APP_URL__', 'http://localhost:5173').replaceAll('__SITE_NAME__', 'Meridian') }],
});
