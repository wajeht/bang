import path from 'node:path';
import type { Knex } from 'knex';
import fs from 'node:fs/promises';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ service: 'migrations' });
const isTesting = process.env.NODE_ENV === 'testing' || process.env.APP_ENV === 'testing';
const MIGRATION_RECORD_EXTENSION = '.js';
const MIGRATION_SOURCE_EXTENSIONS = new Set(['.js', '.ts']);

export class CustomMigrationSource implements Knex.MigrationSource<string> {
    private migrationFiles = new Map<string, string>();

    constructor(private migrationsPath: string) {
        if (!isTesting) {
            logger.info('Migrations path', { path: migrationsPath });
        }
    }

    async getMigrations(): Promise<string[]> {
        try {
            logger.info('Reading migrations directory');
            const dirents = await fs.readdir(this.migrationsPath, {
                withFileTypes: true,
            });
            const preferredExtension = this.migrationsPath.includes(`${path.sep}dist${path.sep}`)
                ? '.js'
                : '.ts';
            const migrationFiles = new Map<string, string>();
            const files = dirents
                .filter((dirent) => dirent.isFile())
                .map((dirent) => dirent.name)
                .filter((file) => MIGRATION_SOURCE_EXTENSIONS.has(path.extname(file)))
                .sort();

            for (const file of files) {
                const parsed = path.parse(file);
                const migrationName = `${parsed.name}${MIGRATION_RECORD_EXTENSION}`;
                const existingFile = migrationFiles.get(migrationName);

                if (!existingFile || path.extname(file) === preferredExtension) {
                    migrationFiles.set(migrationName, file);
                }
            }

            this.migrationFiles = migrationFiles;
            const migrations = [...migrationFiles.keys()].sort();

            if (!isTesting) {
                const migrationList = migrations.map((name, index) => ({
                    order: index + 1,
                    filename: this.migrationFiles.get(name) ?? name,
                    name,
                }));
                logger.table(migrationList);
                logger.info('getMigrations returning', { count: migrations.length });
            }
            return migrations;
        } catch (error) {
            logger.error('Error reading migrations directory', { error });
            logger.info('Attempted path', { path: this.migrationsPath });
            throw error;
        }
    }

    getMigrationName(migration: string): string {
        return migration;
    }

    async getMigration(migration: string): Promise<Knex.Migration> {
        try {
            const migrationFile = await this.resolveMigrationFile(migration);
            const migrationPath = path.join(this.migrationsPath, migrationFile);
            if (!isTesting) {
                logger.info('Loading migration', { path: migrationPath });
            }
            const migrationModule = await import(migrationPath);

            // Handle both named exports and default exports
            if (migrationModule.up && migrationModule.down) {
                return {
                    up: migrationModule.up,
                    down: migrationModule.down,
                };
            } else if (migrationModule.default?.up && migrationModule.default?.down) {
                return migrationModule.default;
            } else {
                throw new Error(`Migration ${migration} does not export up and down functions`);
            }
        } catch (error) {
            logger.error('Error loading migration', { error });
            throw error;
        }
    }

    private async resolveMigrationFile(migration: string): Promise<string> {
        const mappedFile = this.migrationFiles.get(migration);

        if (mappedFile) {
            return mappedFile;
        }

        const parsed = path.parse(migration);
        const candidates = [
            migration,
            `${parsed.name}.ts`,
            `${parsed.name}${MIGRATION_RECORD_EXTENSION}`,
        ];

        for (const candidate of candidates) {
            try {
                await fs.access(path.join(this.migrationsPath, candidate));
                return candidate;
            } catch {
                // Try the next runtime/source extension.
            }
        }

        throw new Error(`Migration file not found for ${migration}`);
    }
}
