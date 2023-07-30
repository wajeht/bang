import express from 'express';
import catchAsyncHandler from 'express-async-handler';

// import { validate } from '../../api.middlewares';

import * as searchController from './search.controllers';

const search = express.Router();

search.get('/', catchAsyncHandler(searchController.getSearch));
search.get('/title', catchAsyncHandler(searchController.getUrlTitle));

export default search;
