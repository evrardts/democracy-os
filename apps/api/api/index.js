// Vercel Serverless Function Entry Point
// Uses compiled JavaScript to avoid TypeScript resolution issues with workspace packages

require('dotenv').config();

const { createApp } = require('../dist/app');

const app = createApp();

module.exports = (req, res) => {
  return app(req, res);
};
