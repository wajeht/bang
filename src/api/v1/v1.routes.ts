import express from 'express';
const v1 = express.Router();

import authRoutes from './auth/auth.routes';
import commandRoutes from './commands/command.routes';
import bookmarkRoutes from './bookmarks/bookmark.routes';
import searchRoutes from './search/search.routes';

import * as apiMiddlewares from '../api.middlewares';

v1.use('/auth', authRoutes);
v1.use('/search', apiMiddlewares.checkAuth, searchRoutes);
v1.use('/commands', apiMiddlewares.checkAuth, commandRoutes);
v1.use('/bookmarks', apiMiddlewares.checkAuth, bookmarkRoutes);

export default v1;
