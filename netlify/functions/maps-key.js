// netlify/functions/maps-key.js
// Serves the Google Maps API key to the frontend without exposing it in the repo.
// Key is restricted by HTTP referrer in Google Cloud Console, so it's safe to return here.

exports.handler = async () => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Maps key not configured' }),
    };
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  };
};
