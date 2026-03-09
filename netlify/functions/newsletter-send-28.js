// netlify/functions/newsletter-send-28.js
// Fixed send — always uses default design. Fires 28th at 9am UTC.
const { handler } = require('./newsletter-send');
exports.handler = () => handler(28);
