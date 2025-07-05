import path from 'node:path';
import fs from 'node:fs/promises';
import type { Knex } from 'knex';
import { logger } from '../utils/logger';

export class CustomMigrationSource implements Knex.MigrationSource<string> {
    constructor(private migrationsPath: string) {
        logger.info('Migrations path: %s', migrationsPath);
    }

    async getMigrations(): Promise<string[]> {
        try {
            const dirents = await fs.readdir(this.migrationsPath, {
                withFileTypes: true,
            });
            const migrations = dirents
                .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.ts'))
                .map((dirent) => dirent.name)
                .sort();

            logger.info('Found migrations: %o', migrations);
            return migrations;
        } catch (error) {
            logger.error('Error reading migrations directory: %o', error);
            logger.info('Attempted path: %s', this.migrationsPath);
            throw error;
        }
    }

    getMigrationName(migration: string): string {
        return path.parse(migration).name;
    }

    async getMigration(migration: string): Promise<Knex.Migration> {
        try {
            const migrationPath = path.join(this.migrationsPath, migration);
            logger.info('Loading migration: %s', migrationPath);
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
            logger.error('Error loading migration: %o', error);
            throw error;
        }
    }
}
