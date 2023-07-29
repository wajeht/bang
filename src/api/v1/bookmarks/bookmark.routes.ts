import express from 'express';

import { validate } from '../../api.middlewares';

import * as bookmarkController from './bookmark.controllers';

const bookmarks = express.Router();

bookmarks.get('/', bookmarkController.getBookmarks);
bookmarks.get('/:id', bookmarkController.getBookmark);
bookmarks.post('/:id', bookmarkController.postBookmark);
bookmarks.patch('/:id', bookmarkController.patchBookmark);
bookmarks.delete('/:id', bookmarkController.deleteBookmark);

export default bookmarks;
