import express from 'express';

import { validate } from '../../api.middlewares';

import * as bookmarkController from './bookmark.controllers';

const bookmarks = express.Router();


bookmarks.get('/', bookmarkController.getBookmarks);

export default bookmarks;
