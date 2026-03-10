// netlify/functions/ref-redirect.js
//
// Handles inbound referral links: pmc.splitpay.com/?ref=[slug]
// Sets a cookie with the slug for future Mixpanel attribution, then
// redirects the renter to rent.app/go (which forwards to the renter signup flow).
//
// Triggered via netlify.toml redirect rule:
//   [[redirects]]
//   from = "/"
//   to = "/.netlify/functions/ref-redirect"
//   status = 200
//   conditions = {Query = ["ref"]}

exports.handler = async (event) => {
  const ref = event.queryStringParameters?.ref;

  // Shouldn't be called without ?ref= but guard anyway
  if (!ref) {
    return {
      statusCode: 302,
      headers: { Location: 'https://pmc.splitpay.com' },
      body: '',
    };
  }

  // Sanitize slug — alphanumeric, hyphens only
  const slug = ref.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);

  return {
    statusCode: 302,
    headers: {
      Location: 'https://rent.app/go',
      // Cookie persists 30 days — ready for Mixpanel hookup later
      'Set-Cookie': `splitpay_ref=${slug}; Path=/; Max-Age=2592000; SameSite=Lax`,
      'Cache-Control': 'no-store',
    },
    body: '',
  };
};
