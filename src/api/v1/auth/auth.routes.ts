import express from 'express';
import catchAsyncHandler from 'express-async-handler';
import { validateRequest } from 'zod-express-middleware';

const auth = express.Router();

import * as authControllers from './auth.controllers';
import * as authValidations from './auth.validations';

auth.post(
	'/login',
	validateRequest({ body: authValidations.postLoginSchema }),
	catchAsyncHandler(authControllers.postLogin),
);

auth.post(
	'/register',
	validateRequest({ body: authValidations.postRegisterSchema }),
	catchAsyncHandler(authControllers.postRegister),
);

auth.post(
	'/reset-password',
	validateRequest({ body: authValidations.postResetPasswordSchema }),
	catchAsyncHandler(authControllers.postLogin),
);

auth.post(
	'/forgot-password',
	validateRequest({ body: authValidations.postForgotPasswordSchema }),
	catchAsyncHandler(authControllers.postLogin),
);

export default auth;
