import express from 'express';
const v1 = express.Router();

import authRoutes from './auth/auth.routes';

v1.use('/auth', authRoutes);

export default v1;
