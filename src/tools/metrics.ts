'use strict';

const client = require('prom-client');
const restify = require('restify');

const { typeCheck: check } = require('type-check');

const HTTP_DEFAULT = 0;
const HTTP_OK = 200;

const MILLISECONDS = 1000;

const DEFAULT_CONFIG = {
  exclude: [],
  metrics: ['status', 'path_duration', 'path_count'],
  pathLimit: 100,
  timeout: 1000
};

const checkConfig = function (cfg) {
  if (!check('Object', cfg)) {
    throw new TypeError('Argument config must be an object');
  }

  const config = { ...DEFAULT_CONFIG, ...cfg };

  if (!check('[String]', config.metrics)) {
    throw new TypeError('config.metrics must be a string[]');
  }

  if (!check('String | RegExp | Function | [String | RegExp | Function]', config.exclude)) {
    throw new TypeError('config.exclude must be one/array of (string | RegExp | function)');
  }

  if (!check('Number', config.timeout) || config.timeout < MILLISECONDS) {
    throw new TypeError('config.timeout must be a number greater or equal to 1000');
  }

  if (!check('Number', config.pathLimit) || config.pathLimit < 0) {
    throw new TypeError('config.pathLimit must be a number greater or equal to 0');
  }

  if (!Array.isArray(config.exclude)) {
    config.exclude = [config.exclude];
  }

  return config;
};

const createMetrics = function (names) {
  const metrics = {};

  if (names.includes('status')) {
    metrics['status'] = new client.Counter({
      name: 'restify_status_codes',
      help: 'Number of response for each HTTP status code.',
      labelNames: ['status_code']
    });
  }

  if (names.includes('path_duration')) {
    metrics['pathDuration'] = new client.Histogram({
      name: 'restify_path_duration',
      help: 'Histogram of response time in seconds for each request path / status code',
      labelNames: ['method', 'path', 'status_code']
    });
  }

  if (names.includes('path_count')) {
    metrics['pathCount'] = new client.Counter({
      name: 'restify_path_count',
      help: 'Number of calls to each path',
      labelNames: ['method', 'path', 'status_code']
    });
  }

  return metrics;
};

const isExcluded = function (path, filters, cache) {
  if (cache.hasOwnProperty(path)) {
    return cache[path];
  }

  const excluded = filters.some((filter) => {
    if (filter instanceof RegExp) {
      return filter.test(path);
    }

    if (typeof filter === 'function') {
      return !!filter(path);
    }

    return path === filter; // String filter
  });

  cache[path] = excluded;

  return excluded;
};

/**
 * @typedef Options
 * @type {object}
 * @property {ExclusionRules} [exclude=[]]    - List of path exclusions
 * @property {string[]}       [metrics]       - Names of HTTP metrics to collect (default to all metrics)
 * @property {number}         [pathLimit=100] - Maximum number of unique paths to count on path_count metric
 * @property {number}         [timeout=1000]  - Interval (ms) between default prometheus metrics collection
 *
 * @typedef ExclusionRules
 * @type {(ExclusionRule | ExclusionRule[])}
 *
 * @typedef ExclusionRule
 * @type {(string | RegExp | function)}
 */

export default {

  /**
   * The prom-client singleton
   */
  client,

  /**
   * Creates a restify 'after' event handler to collect default HTTP metrics
   *
   * Collected metrics:
   *   - Recommended prometheus metrics (see https://github.com/siimon/prom-client#default-metrics)
   *   - restify_status_codes:  Number of response for each HTTP status code
   *   - restify_path_duration: Duration (seconds) by percentiles taken by each defined path to respond
   *   - restify_path_count:    Number of calls to each path
   *
   * @param  {restify.Server} server - Restify server instance
   * @param  {Options}        config - Metrics options
   * @return {function}       A function usable as restify 'after' event handler
   */
  after(server, config = {}) {
    if (typeof server !== 'object' || typeof server.router !== 'object' || typeof server.pre !== 'function') {
      throw new TypeError('Argument server must be a Restify server instance');
    }

    const cfg = checkConfig(config);

    client.collectDefaultMetrics({ timeout: cfg.timeout });

    const cache = {};
    const metrics = createMetrics(cfg.metrics);
    const paths = new Set();

    return restify.plugins.metrics({ server }, (error, { method, path, statusCode, totalLatency }, req, res, route) => {
      const latency = totalLatency / MILLISECONDS;
      const status_code = statusCode || HTTP_DEFAULT;

      if (typeof route !== 'undefined') {
        path = route.path;
      }

      if (!isExcluded(path, cfg.exclude, cache)) {
        if (metrics['status']) {
          metrics['status'].inc({ status_code });
        }

        if (metrics['pathDuration'] && typeof route !== 'undefined') {
          metrics['pathDuration'].observe({ status_code, path, method }, latency);
        }

        if (metrics['pathCount'] && (paths.has(path) || paths.size < cfg.pathLimit)) {
          paths.add(path);

          metrics['pathCount'].inc({ status_code, path, method });
        }
      }
    });
  },

  /**
   * Creates a restify GET handler to expose metrics
   *
   * @returns {restify.RequestHandler} A restify handler
   */
  get() {
    return async (req, res) => {
      res.send(HTTP_OK, await client.register.metrics(), {
        'Content-Type': 'text/plain'
      });
    };
  }

};
