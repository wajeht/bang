import express from 'express';
const v1 = express.Router();

import authRoutes from './auth/auth.routes';
import commandRoutes from './commands/command.routes';

import * as apiMiddlewares from '../api.middlewares';

v1.use('/auth', authRoutes);
v1.use('/commands', apiMiddlewares.checkAuth, commandRoutes);

export default v1;
