// netlify/functions/chat.js
//
// All chatbots across all pages use this file.
// Each page passes a short `context` string to set tone and audience.
// To update product knowledge: edit system-prompt.js — all bots pick it up automatically.

const { SPLIT_PAY_KNOWLEDGE } = require('./system-prompt');

// Linkify any bare URLs the model outputs
function linkifyBareUrls(text) {
  return text.replace(
    /(https?:\/\/[^\s<>"]+|(?<![/@\w])(?:pmc\.splitpay\.com|rent\.app\/go|splitpay\.com)(?:\/[^\s<>"]*)?)/gi,
    (url) => {
      const href = url.startsWith('http') ? url : 'https://' + url;
      return `<a href="${href}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;font-weight:600;">${url}</a>`;
    }
  );
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);

    const context = body.context || 'The user is on pmc.splitpay.com (the property manager hub). They are likely curious about the Starter Kit or how Split Pay works. Default to short, helpful answers.';
    const systemPrompt = SPLIT_PAY_KNOWLEDGE + '\n\nCONTEXT FOR THIS CONVERSATION:\n' + context;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: systemPrompt,
        messages: body.messages,
      }),
    });

    const data = await response.json();

    if (data.content && data.content[0] && data.content[0].text) {
      let text = data.content[0].text;

      // Extract ##SAVE_LEAD## token and fire to Close
      const leadMatch = text.match(/##SAVE_LEAD\|([^#]*)##/);
      if (leadMatch) {
        const params = {};
        leadMatch[1].split('|').forEach(pair => {
          const [k, ...rest] = pair.split('=');
          if (k) params[k] = rest.join('=');
        });
        const closeUrl = 'https://' + event.headers.host + '/api/submit-to-close';
        fetch(closeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formType: 'chat',
            firstName: (params.name || '').split(' ')[0] || '',
            lastName: (params.name || '').split(' ').slice(1).join(' ') || '',
            email: params.email || '',
            company: params.company || '',
            leadSource: 'PMC Chat',
          }),
        }).catch(e => console.error('Close lead error:', e));
        text = text.replace(/##SAVE_LEAD\|[^#]*##\n?/g, '').trim();
      }

      text = linkifyBareUrls(text);
      data.content[0].text = text;
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};