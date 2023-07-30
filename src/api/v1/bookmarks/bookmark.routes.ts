import express from 'express';
import catchAsyncHandler from 'express-async-handler';

import { validate } from '../../api.middlewares';

import * as bookmarkValidations from './bookmark.validations';
import * as bookmarkController from './bookmark.controllers';

const bookmarks = express.Router();

bookmarks.get('/', catchAsyncHandler(bookmarkController.getBookmarks));

bookmarks.get(
	'/:id',
	validate({ params: bookmarkValidations.getBookmarkSchema }),
	catchAsyncHandler(bookmarkController.getBookmark),
);

bookmarks.post(
	'/',
	validate({
		body: bookmarkValidations.postBookmarkSchema,
		db: bookmarkValidations.postBookmarkSchemaExtra,
	}),
	catchAsyncHandler(bookmarkController.postBookmark),
);

bookmarks.delete(
	'/:id',
	validate({
		params: bookmarkValidations.deleteBookmarkParamsSchema,
		body: bookmarkValidations.deleteBookmarkBodySchema,
		db: bookmarkValidations.deleteBookmarkSchemaExtra,
	}),
	catchAsyncHandler(bookmarkController.deleteBookmark),
);

bookmarks.patch(
	'/:id',
	validate({
		params: bookmarkValidations.patchBookmarkParamsSchema,
		body: bookmarkValidations.patchBookmarkBodySchema,
		db: bookmarkValidations.patchBookmarkSchemaExtra,
	}),
	catchAsyncHandler(bookmarkController.patchBookmark),
);

export default bookmarks;
