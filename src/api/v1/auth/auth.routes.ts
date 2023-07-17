import express from 'express';
const auth = express.Router();

import { validate } from '../../api.middlewares';

import * as authControllers from './auth.controllers';
import * as authValidations from './auth.validations';

auth.post('/login', validate({ body: authValidations.postLoginSchema }), authControllers.postLogin);

auth.post(
	'/register',
	validate({ body: authValidations.postRegisterSchema }),
	authControllers.postRegister,
);

auth.post(
	'/reset-password',
	validate({ body: authValidations.postResetPasswordSchema }),
	authControllers.postLogin,
);

auth.post(
	'/forgot-password',
	validate({ body: authValidations.postForgotPasswordSchema }),
	authControllers.postLogin,
);

export default auth;
