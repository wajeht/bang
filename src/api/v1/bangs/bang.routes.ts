import express from 'express';
import catchAsyncHandler from 'express-async-handler';

// import { validate } from '../../api.middlewares';

import * as bangController from './bang.controllers';

const bangs = express.Router();

bangs.get('/query', catchAsyncHandler(bangController.getQuery));

export default bangs;
