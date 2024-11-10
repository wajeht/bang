import knex from 'knex';
import knexConfig from './knexfile';
import { attachPaginate } from 'knex-paginate';

attachPaginate();

export { redis } from './redis';

export const db = knex(knexConfig);
