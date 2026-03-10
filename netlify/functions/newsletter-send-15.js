// netlify/functions/newsletter-send-15.js
// Fixed send — always uses default design. Fires 15th at 9am UTC.
const { handler } = require('./newsletter-send');
exports.handler = () => handler(15);
