"use strict";

import Stripe from 'stripe';
import * as config from "config";
import * as restify from "restify";
import {events, subscribe} from './tools/rabbitmq';


const secretKey: string = config.get('payment.stripe.secretKey');
const apiVersion:Stripe.StripeConfig = {apiVersion: config.get('payment.stripe.apiVersion')};

const secretHook: string = config.get('payment.stripe.webhooks.secret');

const stripe = new Stripe(secretKey, apiVersion);

  const schema = {
    $id:     'https://schemas.mytf1vod.tf1.fr/test.rabbitmq.schema.json',
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      message: {type: 'string'}
    },
    required: ['message']
  };

  // events.on('connected', async () => {
  //   console.log('Rabbitmq "Connnexion" event detected : SUBSCRIBE to queue succeded ...');

  //   await subscribe({queue: 'bleme.payment.succeded.queue', retry: 5000}, schema, async (msg: any) => {
  //     console.log('[ RabbitMQ ] Message recept : ', {msg});
  //     try {
  //       const data = Buffer.from(msg.body.data);

  //       console.log({data: data.toString()});
  //       const clear = stripe.webhooks.constructEvent(data, msg.signature, secretHook);

  //       console.log({clear});

  //     } catch (err) {
  //       console.log(`Webhook Error: ${err.message}`);
  //     }
  //   });
    
  //   console.log(' ... SUBSCRIPTION OK');
  // });

  // socket configuration
  const socketConfiguration = {
    port: config.has("bind.port")
      ? config.get("bind.port")
      : ("8001"),
    address: config.has("bind.ip")
      ? config.get("bind.ip")
      : ("0.0.0.0")
  };

  // restify server
  const server = restify.createServer({name: "api-payment"});
  server.pre(function (request, response, next) {
    next();
  });

  // server.use(function (request, response, next) {
  //   console.info({body: request.body});
  //   next();
  // });

  // server errors logging
  server.on("error", err => {
    console.error(err);
  });

  // server logger
  // server.on("after", restify.plugins.auditLogger({log: logger, event: "after"}));

  // error handling
  // server.on("restifyError", errorHandler);

  // prometheus
  // server.pre(promBundle.preMiddleware(server));

  // jwt
  // const publicKey = fs.readFileSync(path.join(__dirname, "../config", "jwtRS256.key.pub")).toString();
  // server.use(jwt({ secret: publicKey })
  //   ["unless"]({path: ["/healthz", "/readiness", /\/doc\/.*/, /api\/v[0-9]+\/payment\/public\/.*/]}));

  // restify plugins
  server.pre(restify.pre.userAgentConnection());
  server.use(restify.plugins.acceptParser(server.acceptable));
  server.use(restify.plugins.queryParser({mapParams: true}));

  // body parser
  server.use(restify.plugins.bodyParser({
      maxBodySize: 512 * 1024, // 512k
      mapParams: true
  }));

  // parameters validation
  // server.use(validation);

  // routes
  require("./routes/health")(server);
  require("./routes/payment")(server);
  require("./routes/metrics")(server);

  // documentation
  // server.get(/\/doc\/.*/, restify.plugins.serveStatic({
  //   directory: path.resolve(__dirname, ".."),
  //   default: "index.html"
  // }));

  // bind socket
  server.listen(socketConfiguration.port, socketConfiguration.address, async () => {
    console.info(`http server listening at ${server.url}`);

    // loop();
  });

  const loop = () => {
    console.log("====================================")
    let marge = 0;
    const now = Date.now();
    do {
        marge = Date.now() - now;

      console.log(`${marge}`);
    } while (marge < 1000);

    console.log("====================================")
    setTimeout(loop, 0);
  }
