import express from 'express';
import catchAsyncHandler from 'express-async-handler';

import { validate } from '../../api.middlewares';

import * as bookmarkValidations from './bookmark.validations';
import * as bookmarkController from './bookmark.controllers';

const bookmarks = express.Router();

bookmarks.get('/', catchAsyncHandler(bookmarkController.getBookmarks));

bookmarks.get(
	'/:id',
	validate({
		params: bookmarkValidations.getBookmarkSchema,
	}),
	catchAsyncHandler(bookmarkController.getBookmark),
);

bookmarks.post('/:id', bookmarkController.postBookmark);

bookmarks.patch('/:id', bookmarkController.patchBookmark);

bookmarks.delete('/:id', bookmarkController.deleteBookmark);

export default bookmarks;
