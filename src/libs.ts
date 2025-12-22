import { Eta } from 'eta';
import knex from 'knex';
import cors from 'cors';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cron from 'node-cron';
import express from 'express';
import dayjsBase from 'dayjs';
import jwt from 'jsonwebtoken';
import { marked } from 'marked';
import hljs from 'highlight.js';
import flash from 'connect-flash';
import utc from 'dayjs/plugin/utc';
import nodemailer from 'nodemailer';
import { csrfSync } from 'csrf-sync';
import session from 'express-session';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import timezone from 'dayjs/plugin/timezone';

dayjsBase.extend(utc);
dayjsBase.extend(timezone);

export const dayjs = dayjsBase;

export const libs = {
    // Core utilities
    jwt,
    dayjs,
    bcrypt,
    dotenv,
    nodemailer,

    // Markdown & syntax highlighting
    hljs,
    marked,

    // Scheduling
    cron,

    // Database
    knex,

    // Express & middleware
    Eta,
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
