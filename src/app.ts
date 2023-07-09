import express from 'express';
const app = express();

import api from './api/api.routes';
import * as AppMiddlewares from './app.middlewares';

app.use('/api', api);

app.use(AppMiddlewares.notFoundHandler);
app.use(AppMiddlewares.errorHandler);

export default app;
