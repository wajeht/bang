import knex from 'knex';
import { Eta } from 'eta';
import bcrypt from 'bcrypt';
import cron from 'node-cron';
import { marked, Marked, Renderer } from 'marked';
import hljs from 'highlight.js';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import * as dompurify from 'isomorphic-dompurify';

export const libs = {
    // Core utilities
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
