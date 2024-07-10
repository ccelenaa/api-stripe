"use strict";

import * as config from 'config';
import * as path from 'path';
import pg, {Knex} from 'knex';
import {isConnected} from './../tools/rabbitmq';

let knex: Knex = pg(config.get("database"));

const metadata = require(path.join(__dirname, "../..", "package.json"));

const probes = {
  postgres: () => knex.raw('SELECT 1'),
  // rabbitmq: () => {
  //   if (!isConnected()) {
  //     throw new Error('RabbitMQ connection closed');
  //   }
  // }
};

module.exports = server => {
  server.get("/liveness", (req, res, next) => {
    const returnStatus = {
      result: true,
      name: metadata.name,
      version: metadata.version
    };
    res.json(returnStatus);
    return next();
  });

  server.get("/readiness", async (req, res) => {
    const response = {name: metadata.name, version: metadata.version};
    let ready = true;

    for (const [probe, cb] of Object.entries(probes)) {
      try {
        await cb();

        response[probe] = 'OK';
      } catch (err) {
        console.error({probe, err});
        ready = false;

        response[probe] = `KO: ${err.message}`;
      }
    }
    
    res.json(ready ? 200 : 500, response);

  });
};
