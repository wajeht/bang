import express from 'express';
import catchAsyncHandler from 'express-async-handler';

import { validate } from '../../api.middlewares';

const auth = express.Router();

import * as authControllers from './auth.controllers';
import * as authValidations from './auth.validations';

auth.post(
	'/login',
	validate({ body: authValidations.postLoginSchema }),
	catchAsyncHandler(authControllers.postLogin),
);

auth.post(
	'/register',
	validate({ body: authValidations.postRegisterSchema }),
	catchAsyncHandler(authControllers.postRegister),
);

auth.post(
	'/reset-password',
	validate({ body: authValidations.postResetPasswordSchema }),
	catchAsyncHandler(authControllers.postLogin),
);

auth.post(
	'/forgot-password',
	validate({ body: authValidations.postForgotPasswordSchema }),
	catchAsyncHandler(authControllers.postLogin),
);

export default auth;
