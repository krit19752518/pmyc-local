import express, { Router } from 'express';
import path from 'path';

/** Issue99 UI candidate: synthetic fixtures only, no database or session dependency. */
export function createPublicWebsiteRouter(assetRoot = path.resolve(__dirname, '../../public/public-v4')): Router {
  const router = Router();
  router.get(['/', '/index.php', '/public-v4', '/public-v4/'], (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.sendFile(path.join(assetRoot, 'index.html'));
  });
  router.use('/public-v4', express.static(assetRoot, {
    index: false, dotfiles: 'deny', fallthrough: true, maxAge: 0,
    setHeaders: res => { res.setHeader('X-Content-Type-Options', 'nosniff'); }
  }));
  return router;
}
