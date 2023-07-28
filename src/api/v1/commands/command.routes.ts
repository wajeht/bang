import express from 'express';
const commands = express.Router();

import * as commandControllers from './command.controllers';

commands.get('/', commandControllers.getCommands);

export default commands;
