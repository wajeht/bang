import express from 'express';
const v1 = express.Router();

import v1Controllers from './v1.controllers';

v1.get('/', v1Controllers.getV1);

export default v1;
