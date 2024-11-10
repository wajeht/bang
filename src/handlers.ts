import { Request, Response } from 'express';

// GET /
export function getHomePageHandler(req: Request, res: Response) {
	return res.render('home.html', {
		path: '/',
	});
}

// GET /healthz
export function getHealthzHandler(req: Request, res: Response) {
	if (req.get('Content-Type') === 'application/json') {
		res.status(200).json({ message: 'ok' });
		return;
	}

	res.setHeader('Content-Type', 'text/html').status(200).send('<p>ok</p>');
}

// GET /terms-of-service
export function getTermsOfServicePageHandler(req: Request, res: Response) {
	return res.render('terms-of-service.html', {
		path: '/terms-of-service',
	});
}

// GET /privacy-policy
export function getPrivacyPolicyPageHandler(req: Request, res: Response) {
	return res.render('privacy-policy', {
		path: '/privacy-policy',
	});
}
