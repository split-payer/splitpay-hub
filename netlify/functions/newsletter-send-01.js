// netlify/functions/newsletter-send-01.js
// Variable send — uses NEWSLETTER_OVERRIDE_01 env var if set, else default.
// Fires 1st at 9am UTC.
const { handler } = require('./newsletter-send');
exports.handler = () => handler(1);
