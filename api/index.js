// Vercel Serverless Function Entry Point
require('dotenv').config();

const { createApp } = require('../apps/api/dist/app');

const app = createApp();

module.exports = (req, res) => {
  return app(req, res);
};
