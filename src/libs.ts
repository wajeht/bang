import knex from 'knex';
import { Eta } from 'eta';
import bcrypt from 'bcrypt';
import cron from 'node-cron';
import dayjsBase from 'dayjs';
import jwt from 'jsonwebtoken';
import { marked, Marked, Renderer } from 'marked';
import hljs from 'highlight.js';
import crypto from 'node:crypto';
import utc from 'dayjs/plugin/utc.js';
import nodemailer from 'nodemailer';
import timezone from 'dayjs/plugin/timezone.js';
import * as dompurify from 'isomorphic-dompurify';

dayjsBase.extend(utc);
dayjsBase.extend(timezone);

export const dayjs = dayjsBase;

export const libs = {
    // Core utilities
    jwt,
    dayjs,
    bcrypt,
    crypto,
    nodemailer,

    // Markdown & syntax highlighting
    hljs,
    marked,
    Marked,
    Renderer,
    dompurify,

    // Scheduling
    cron,

    // Database
    knex,

    // Templates
    Eta,
} as const;

export type Libs = typeof libs;
