import { Request, Response } from 'express';

export default class v1Controllers {
	public static getV1(req: Request, res: Response) {
		return res.status(200).json({
			message: 'Welcome to the v1 API',
		});
	}
}
