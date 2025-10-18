import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import dayjsBase from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { marked } from 'marked';
import hljs from 'highlight.js';
import cron from 'node-cron';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import flash from 'connect-flash';
import session from 'express-session';
import { csrfSync } from 'csrf-sync';
import ejs from 'ejs';
import knex from 'knex';

dayjsBase.extend(utc);
dayjsBase.extend(timezone);

export const dayjs = dayjsBase;

export const libs = {
    // Core utilities
    jwt,
    dayjs,
    bcrypt,
    nodemailer,

    // Markdown & syntax highlighting
    hljs,
    marked,

    // Scheduling
    cron,

    // Database
    knex,

    // Express & middleware
    ejs,
    cors,
    flash,
    helmet,
    express,
    session,
    csrfSync,
    rateLimit,
    compression,
} as const;

export type Libs = typeof libs;
