import express from 'express';
const api = express.Router();

import v1 from './v1/v1.routes';

api.use('/v1', v1);

export default api;
