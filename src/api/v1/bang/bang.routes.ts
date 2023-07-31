import express from 'express';
import catchAsyncHandler from 'express-async-handler';

// import { validate } from '../../api.middlewares';

import * as bangController from './bang.controllers';

const bang = express.Router();

bang.get('/search', catchAsyncHandler(bangController.getSearch));
bang.get('/url', catchAsyncHandler(bangController.getUrlInfo));

export default bang;
