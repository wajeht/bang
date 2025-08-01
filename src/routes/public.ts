import express, { Request, Response } from 'express';
import { Knex } from 'knex';
import { Search } from '../type';
import { expectJson, getConvertedReadmeMDToHTML } from '../utils/util';
import { bangs } from '../db/bang';

export function createPublicRoutes(search: Search, db: Knex) {
    const router = express.Router();

    router.get('/', async (req: Request, res: Response) => {
        const query = req.query.q?.toString().trim() || '';
        const user = req.session.user || undefined;

        if (!query) {
            return res.render('home.html', {
                path: '/',
                title: 'Search',
            });
        }

        await search({ res, user, query, req });
    });

    router.get('/bangs', (_req: Request, res: Response) => {
        return res.render('bangs.html', {
            path: '/bangs',
            title: 'Bangs',
            bangs,
        });
    });

    router.get('/how-to', async (_req: Request, res: Response) => {
        return res.render('how-to.html', {
            path: '/how-to',
            title: 'How To',
            howToContent: await getConvertedReadmeMDToHTML(),
        });
    });

    router.get('/healthz', async (req: Request, res: Response) => {
        await db.raw('SELECT 1');

        if (expectJson(req)) {
            res.status(200).json({ status: 'ok', database: 'connected' });
            return;
        }

        res.setHeader('Content-Type', 'text/html').status(200).send('<p>ok</p>');
    });

    router.get('/privacy-policy', (_req: Request, res: Response) => {
        return res.render('privacy-policy.html', {
            path: '/privacy-policy',
            title: 'Privacy Policy',
        });
    });

    router.get('/terms-of-service', (_req: Request, res: Response) => {
        return res.render('terms-of-service.html', {
            path: '/terms-of-service',
            title: 'Terms of Service',
        });
    });

    return router;
}
