import knex from 'knex';
import knexConfig from './knexfile';
import { attachPaginate } from 'knex-paginate';

attachPaginate();

export const db = knex(knexConfig);
