import path from 'node:path';
import type { Knex } from 'knex';
import fs from 'node:fs/promises';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'migrations' });
const isTesting = process.env.NODE_ENV === 'testing' || process.env.APP_ENV === 'testing';

export class CustomMigrationSource implements Knex.MigrationSource<string> {
    constructor(private migrationsPath: string) {
        if (!isTesting) {
            logger.info('Migrations path', { path: migrationsPath });
        }
    }

    async getMigrations(): Promise<string[]> {
        try {
            const dirents = await fs.readdir(this.migrationsPath, {
                withFileTypes: true,
            });
            const migrations = dirents
                .filter(
                    (dirent) =>
                        dirent.isFile() &&
                        (dirent.name.endsWith('.ts') || dirent.name.endsWith('.js')),
                )
                .map((dirent) => dirent.name)
                .sort();

            if (!isTesting) {
                const migrationList = migrations.map((name, index) => ({
                    order: index + 1,
                    filename: name,
                    name: path.parse(name).name,
                }));
                logger.table(migrationList);
            }
            return migrations;
        } catch (error) {
            logger.error('Error reading migrations directory', { error });
            logger.info('Attempted path', { path: this.migrationsPath });
            throw error;
        }
    }

    getMigrationName(migration: string): string {
        return path.parse(migration).name;
    }

    async getMigration(migration: string): Promise<Knex.Migration> {
        try {
            const migrationPath = path.join(this.migrationsPath, migration);
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
}
