"use strict";

import * as config from 'config';
import * as amqplib from 'amqplib';

import {EventEmitter} from 'events';

// const logger = require('@core/grayan')('rabbitmq');

import Ajv from 'ajv';

const CONFIG_KEY                 = 'rabbitmq';
const DEFAULT_CONNECTION_TIMEOUT = 5000;
const DEFAULT_RETRY_DELAY        = 2500;

if (!config.has(CONFIG_KEY)) {
  throw new Error(`‘${CONFIG_KEY}’ not found in configuration`);
}

/**
 * @typedef {Object} Binding
 * @property {string} [queue]    - Queue name
 * @property {string} [exchange] - Exchange name
 * @property {string} [key]      - Routing key
 *
 * @typedef {Object} Exchange
 * @property {string}    type       - Exchange type (fanout, direct, topic, headers)
 * @property {boolean}   [internal] - If true, exchange is declared internal
 * @property {Binding[]} [bind]     - List of queue to bind on this exchange (queue and key)
 *
 * @typedef {Object} Queue
 * @property {number}    [ttl]          - Messages TTL
 * @property {Object}    [dlx]          - Queue dead letter exchange
 * @property {string}    [dlx.exchange] - DLX name
 * @property {string}    [dlx.key]      - Routing key used to publish message in the DLX
 * @property {Binding[]} [bind]         - List of queue to bind on this exchange (exchange and key)
 */

const ajv = new Ajv();

let enabled    = true;
let connecting = false;
let connection = null;
let channel    = null;

const events = new EventEmitter();

const createTopology = async (channel, topology) => {
  const {exchanges = {}, queues = {}, bindings = []} = topology;

  for (const [name, exchange] of Object.entries(exchanges)) {
    const {type, internal = false, bind = []}: any = exchange;
    await channel.assertExchange(name, type, {internal});

    bindings.push(...bind.map((binding) => ({...binding, exchange: name})));
  }

  for (const [name, queue] of Object.entries(queues)) {
    const {ttl, dlx = {}, bind = [], ...options}: any = queue;
    const {exchange, key} = dlx;

    await channel.assertQueue(name, {
      deadLetterExchange:   exchange,
      deadLetterRoutingKey: key,
      messageTtl:           ttl,
      ...options
    });

    bindings.push(...bind.map((binding) => ({...binding, queue: name})));
  }

  for (const {queue, exchange, key} of bindings) {
    await channel.bindQueue(queue, exchange, key);
  }
};

/**
 * Return channel
 *
 * @returns {Promise} A promise resolved when the channel is created
 */
function getChannel () {
  if (channel !== null) {
    return Promise.resolve(channel);
  }

  return new Promise((resolve, reject) => {
    const {timeout = DEFAULT_CONNECTION_TIMEOUT}: any = config.get(CONFIG_KEY);

    const timer = setTimeout(() => {
      events.removeListener('connected', cb);

      return reject(new Error('Connection timeout'));
    }, timeout);

    const cb = () => {
      clearTimeout(timer);

      return resolve(channel);
    };

    events.once('connected', cb);
  });
};

const getBuffer = (msg) => {
  if (Buffer.isBuffer(msg)) {
    return msg;
  }

  if (typeof msg === 'string') {
    return Buffer.from(msg, 'utf8');
  }

  if (typeof msg === 'object' && msg !== null) {
    return Buffer.from(JSON.stringify(msg), 'utf8');
  }

  throw new TypeError('The message should be a buffer, a string or a non-null object');
};


/**
 * Check connection status
 *
 * @returns {boolean} True when the connection is opened, false otherwise
 */
function isConnected() {
  return connection !== null && channel !== null;
};

/**
 * Subscribe to a queue
 *
 * Received messages are validated against the JSON schema.
 * Invalid messages are ignored (acked).
 * The message is acked if the handler is resolved, nacked otherwise.
 *
 * @param   {Object}   options         - Subscription options
 * @param   {string}   options.queue   - Name of the queue to subscribe to
 * @param   {number}   [options.retry] - Delay to retry failed messages
 * @param   {Object}   schema          - JSON schema to validate received messages
 * @param   {Function} handler         - Handler called with message content (must return a Promise)
 * @returns {Promise}  A Promise resolved when subscription is completed
 */
async function subscribe ({queue, retry}, schema, handler) {
  // const validate = ajv.compile(schema);
  const channel  = await getChannel();

  if (typeof retry === 'number' && retry > 0) {
    const exchange = `${queue}.dlx`;

    await createTopology(channel, {
      exchanges: {
        [exchange]: {type: 'direct'}
      },
      queues: {
        [queue]: {
          dlx:  {exchange, key: 'wait'},
          bind: [{exchange, key: 'retry'}],
          arguments: {
            'x-queue-type': 'quorum',
            'x-quorum-initial-group-size': 5,
            'x-quorum-member-lease-count': 5,
          } // 'x-single-active-consumer': true
        },
        [`${queue}.retry`]: {
          dlx:  {exchange, key: 'retry'},
          bind: [{exchange, key: 'wait'}],
          arguments: {
            'x-queue-type': 'quorum',
            'x-quorum-initial-group-size': 5,
            'x-quorum-member-lease-count': 5,
          }, // 'x-single-active-consumer': true
          ttl:  retry
        }
      }
    });
  } else {
    await channel.assertQueue(queue);
  }

  const { HOSTNAME : consumerTag = `api-payment-${Math.random()}` } = process.env;

  await channel.consume(queue, (msg) => {
    if (msg === null) {
      return null;
    }

    try {
      const content = JSON.parse(msg.content.toString());

      // if (!validate(content)) {
      //   throw new Error(`Invalid message: ${ajv.errorsText(validate.errors)}`);
      // }

      return handler(content).then(() => {
        channel.ack(msg);
      }).catch((error) => {
        events.emit('error', error);

        channel.nack(msg, false, false);
      });
    } catch (error) {
      events.emit('error', error);

      return channel.ack(msg);
    }
  }, {consumerTag});
}


/**
 * Create RabbitMQ entities
 *
 * @param   {Object}                    topology             - List of entities to create on the RabbitMQ broker
 * @param   {Object.<string, Exchange>} [topology.exchanges] - List of exchanges
 * @param   {Object.<string, Queue>}    [topology.queues]    - List of queues
 * @param   {Binding[]}                 [topology.bindings]  - List of bindings
 * @returns {Promise}                   A promise resolved when all entities have been created
 */
async function configure (topology) {
  const channel = await getChannel();

  return createTopology(channel, topology);
}

/**
 * Publish a message
 *
 * @param   {string}               exchange   - Exchange name
 * @param   {string}               routingKey - Routing key used to publish message
 * @param   {string|object|Buffer} msg        - Message to publish
 * @param   {object}               [options]  - Publish options
 * @returns {Promise}              A Promise resolved when the message is published
 */
async function publish (exchange, routingKey, msg, options = {}) {
  const channel = await getChannel();

  await channel.publish(exchange, routingKey, getBuffer(msg), options);
}


/**
 * Close the connection to the RabbitMQ broker
 *
 * @returns {Promise} A Promise resolved when the connection is closed
 */
async function close () {
  enabled = false;

  if (channel !== null) {
    await channel.close();
  }

  if (connection !== null) {
    await connection.close();
  }
}

async function connect() {
  if (enabled && connecting === false) {
    connecting = true;

   console.log('Connecting');

    const {connection: options, topology = null, retry: delay = DEFAULT_RETRY_DELAY}: any = config.get(CONFIG_KEY);

    try {
      if (connection === null) {
       console.log('Opening connection');

        connection = await amqplib.connect(options);

        connection.on('close', (error) => {
          if (error) {
           console.log(error, 'Connection error');
          }

         console.log('Connection closed');

          connection = null;

          connect();
        });
      }

      if (channel === null) {
       console.log('Opening channel');

        channel = await connection.createChannel();

        channel.on('error', (error) => {
         console.log(error, 'Channel error');
        });

        channel.on('close', () => {
         console.log('Channel closed');

          channel = null;

          connect();
        });
      }

      if (topology !== null) {
        await createTopology(channel, topology);
      }

      console.log('Connected');

      events.emit('connected');
    } catch (error) {
      console.log(error, 'Connection failed');

      setTimeout(connect, delay);
    } finally {
      connecting = false;
    }
  }
};

export {
  events,
  isConnected,
  getChannel,
  configure,
  subscribe,
  publish,
  close,
};
