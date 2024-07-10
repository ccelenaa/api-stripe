'use strict';

import prometheus from '../tools/metrics';

module.exports = (server) => {
  server.on('after', prometheus.after(server));

  server.get('/metrics', prometheus.get());
};
