import type { Knex } from 'knex';
import { config } from './config';
import dayjs from './utils/dayjs';
import * as mail from './utils/mail';
import * as util from './utils/util';
import type { Logger } from './type';
import { logger } from './utils/logger';
import * as search from './utils/search';
import { db as database } from './db/db';
import { tabs } from './routes/tabs/tabs.repo';
import { notes } from './routes/notes/notes.repo';
import { actions } from './routes/actions/actions.repo';
import { NotFoundError, ValidationError } from './error';
import { bookmarks } from './routes/bookmarks/bookmarks.repo';
import { reminders } from './routes/reminders/reminders.repo';
import { createCronService, type CronService } from './crons';
import type { Actions, Bookmarks, Notes, Tabs, Reminders } from './type';

export const errors = {
    NotFoundError,
    ValidationError,
};

export interface Models {
    actions: Actions;
    bookmarks: Bookmarks;
    notes: Notes;
    tabs: Tabs;
    reminders: Reminders;
}

export interface Services {
    crons: CronService;
}

export interface Utilities {
    util: typeof util;
    search: typeof search;
    mail: typeof mail;
    dayjs: typeof dayjs;
}

export interface AppContext {
    config: typeof config;
    logger: Logger;
    db: Knex;
    errors: typeof errors;
    models: Models;
    services: Services;
    utils: Utilities;
}

export async function createContext(): Promise<AppContext> {
    if (!config) {
        throw new Error('Configuration required for app context');
    }

    if (!logger) {
        throw new Error('Logger required for app context');
    }

    if (!database) {
        throw new Error('Database required for app context');
    }

    const models: Models = {
        actions,
        bookmarks,
        notes,
        tabs,
        reminders,
    };

    const services: Services = {
        crons: createCronService({ logger }),
    };

    const utilities: Utilities = {
        util,
        search,
        mail,
        dayjs,
    };

    const ctx: AppContext = {
        config,
        logger,
        db: database,
        errors,
        models,
        services,
        utils: utilities,
    };

    return config.app.env === 'production' ? Object.freeze(ctx) : ctx;
}
