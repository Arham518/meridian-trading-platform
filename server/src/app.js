import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import net from 'node:net';
import { holdResponseUntilSaved } from './persist.js';
import { getSettings } from './db.js';
import { adsenseInUse } from './services/media.js';
import authRoutes from './routes/auth.js';
import signalRoutes from './routes/signals.js';
import marketRoutes from './routes/market.js';
import watchlistRoutes from './routes/watchlist.js';
import tradingRoutes from './routes/trading.js';
import exportRoutes from './routes/exports.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  // Behind Cloudflare + the host's router every request reaches us from a proxy. Cloudflare puts the visitor's
  // address in CF-Connecting-IP, so use it (when it holds a valid IP) for rate limits, sessions and the activity log.
  if (config.clientIpHeader && config.clientIpHeader !== 'off') {
    app.use((req, res, next) => {
      const v = String(req.headers[config.clientIpHeader] || '').trim();
      if (v && net.isIP(v)) Object.defineProperty(req, 'ip', { value: v, configurable: true, enumerable: true });
      next();
    });
  }
  // hosted mode: a response that follows a change is sent only after the change is stored in PostgreSQL
  app.use(holdResponseUntilSaved);
  // Content Security Policy. Google AdSense domains are added only while an AdSense unit is enabled.
  const ADSENSE = {
    script: ['https://pagead2.googlesyndication.com', 'https://partner.googleadservices.com', 'https://tpc.googlesyndication.com', 'https://www.googletagservices.com', 'https://adservice.google.com', 'https://*.adtrafficquality.google'],
    frame: ['https://googleads.g.doubleclick.net', 'https://tpc.googlesyndication.com', 'https://www.google.com', 'https://*.adtrafficquality.google'],
    connect: ['https://pagead2.googlesyndication.com', 'https://*.adtrafficquality.google', 'https://csi.gstatic.com'],
  };
  const withAds = (base, extra) => (req, res) => [...base, ...(adsenseInUse() ? extra : [])].join(' ');
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'connect-src': [withAds(["'self'", 'ws:', 'wss:', 'https://cloudflareinsights.com'], ADSENSE.connect)],
        'worker-src': ["'self'", 'blob:'],
        'media-src': ["'self'", 'https:', 'blob:'],
        'frame-src': [withAds(['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com'], ADSENSE.frame)],
        'script-src': [withAds(["'self'", 'https://static.cloudflareinsights.com'], ADSENSE.script)],
        'style-src': ["'self'", "'unsafe-inline'"],
      },
    },
  }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({ limit: '200kb' }));

  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', index: false, dotfiles: 'deny' }));
  app.use('/api', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/signals', signalRoutes);
  app.use('/api/market', marketRoutes);
  app.use('/api/watchlist', watchlistRoutes);
  app.use('/api/trading', tradingRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // SEO files are generated from APP_URL so links always point at the live address
  app.get('/robots.txt', (req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(robotsTxt()));
  app.get('/sitemap.xml', (req, res) => res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(sitemapXml()));

  // Serve the built React app (npm run build) from Express in production
  const indexFile = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (/[\\/]assets[\\/]/.test(p)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); } }));
    let html = null;
    const page = () => {
      if (!html || config.env !== 'production') html = fs.readFileSync(indexFile, 'utf8');
      const name = escapeHtml(getSettings().site_name || 'Meridian');
      return html.replaceAll('__APP_URL__', config.appUrl).replaceAll('__SITE_NAME__', name);
    };
    // only page routes get the app shell; a missing file (/foo.xml, /x.txt, /a.js) is a real 404
    app.get('*', (req, res, next) => {
      if (path.extname(req.path) && !req.path.endsWith('.html')) return next();
      res.set('Cache-Control', 'no-cache').type('html').send(page());
    });
  }
  app.use((req, res) => res.status(404).type('text/plain').send('Not found'));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.name === 'MulterError') return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large' : err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    const status = err.status || 500;
    if (status >= 500) console.error('[error]', err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message, details: err.details });
  });
  return app;
}

const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const PUBLIC_PAGES = ['/', '/register', '/login', '/terms', '/privacy', '/risk'];

export function robotsTxt() {
  return `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /admin\nDisallow: /api/\nDisallow: /reset-password\nDisallow: /verify-email\nDisallow: /confirm-email\n\nSitemap: ${config.appUrl}/sitemap.xml\n`;
}

export function sitemapXml() {
  const day = new Date().toISOString().slice(0, 10);
  const urls = PUBLIC_PAGES.map((p) => `  <url><loc>${config.appUrl}${p === '/' ? '/' : p}</loc><lastmod>${day}</lastmod><changefreq>${p === '/' ? 'daily' : 'monthly'}</changefreq><priority>${p === '/' ? '1.0' : '0.5'}</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
