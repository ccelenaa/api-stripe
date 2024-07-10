require('ts-node/register');

import * as config from 'config';
import { Knex } from "knex";

console.log(config.get('database'));

const migration = Object.assign(
  {},
  config.get('database'),
  {
    migrations: {
      schemaName: 'public',
      tableName: `migrations`,
      disableTransactions: true,
      migrationSource: require('./migrations/source')
    }
  });

module.exports =  migration as Knex.Config;

