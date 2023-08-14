import express from 'express';
import catchAsyncHandler from 'express-async-handler';

import { validate } from '../../api.middlewares';

import * as bangController from './bang.controllers';
import * as bangValidations from './bang.validations';

const bang = express.Router();

bang.get(
	'/search',
	validate({ query: bangValidations.getSearchSchema }),
	catchAsyncHandler(bangController.getSearch),
);

bang.get(
	'/url',
	validate({ query: bangValidations.getUrlInfoSchema }),
	catchAsyncHandler(bangController.getUrlInfo),
);

export default bang;
