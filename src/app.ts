import express from 'express';
const app = express();

import api from './api/api.routes';

app.use('/api', api);

export default app;
