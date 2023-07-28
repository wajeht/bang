import express from 'express';
import catchAsyncHandler from 'express-async-handler';

import { validate } from '../../api.middlewares';

const auth = express.Router();

import * as authControllers from './auth.controllers';
import * as authValidations from './auth.validations';

auth.post(
	'/login',
	validate({ body: authValidations.postLoginSchema }),
	validate({ body: authValidations.postLoginSchemaExtra }),
	catchAsyncHandler(authControllers.postLogin),
);

auth.post('/logout', catchAsyncHandler(authControllers.postLogout));

auth.post(
	'/register',
	validate({ body: authValidations.postRegisterSchema }),
	validate({ body: authValidations.postRegisterSchemaExtra }),
	catchAsyncHandler(authControllers.postRegister),
);

auth.post(
	'/reset-password',
	validate({ body: authValidations.postResetPasswordSchema }),
	validate({ body: authValidations.postResetPasswordSchemaExtra }),
	catchAsyncHandler(authControllers.postResetPassword),
);

auth.post(
	'/forgot-password',
	validate({ body: authValidations.postForgotPasswordSchema }),
	validate({ body: authValidations.postForgotPasswordSchemaExtra }),
	catchAsyncHandler(authControllers.postForgotPassword),
);

auth.post(
	'/verify-email',
	validate({ body: authValidations.postVerifyEmailSchema }),
	validate({ body: authValidations.postVerifyEmailSchemaExtra }),
	catchAsyncHandler(authControllers.postVerifyEmail),
);

export default auth;
