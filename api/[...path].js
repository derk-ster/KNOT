'use strict';
// Vercel serverless entry: every /api/* request is handled by the same code as server.js.
module.exports = require('../server.js').handler;
