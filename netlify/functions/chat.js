// netlify/functions/chat.js
const { SPLIT_PAY_KNOWLEDGE } = require('./system-prompt');

function linkifyBareUrls(text) {
  return text.replace(
    /(https?:\/\/[^\s<>".,!?]+|(?<![/@\w])(?:pmc\.splitpay\.com|rent\.app\/go|splitpay\.com)(?:\/[^\s<>".,!?]*)?)/gi,
    (url) => {
      const href = url.startsWith('http') ? url : 'https://' + url;
      return '<a href="' + href + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;font-weight:600;">' + url + '</a>';
    }
  );
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const body = JSON.parse(event.body);
    const context = body.context || 'The user is on pmc.splitpay.com (the property manager hub).';
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

      // Detect email directly from user messages — don't rely on model emitting token
      const allUserText = (body.messages || [])
        .filter(m => m.role === 'user')
        .map(m => m.content).join(' ');
      const emailMatch = allUserText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        const detectedEmail = emailMatch[0];
        const nameMatch = allUserText.match(/(?:my name is|i'm|i am)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)/i);
        const detectedName = nameMatch ? nameMatch[1] : '';
        const closeUrl = 'https://' + event.headers.host + '/api/submit-to-close';
        fetch(closeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formType: 'chat',
            firstName: detectedName.split(' ')[0] || '',
            lastName: detectedName.split(' ').slice(1).join(' ') || '',
            email: detectedEmail,
            company: '',
            leadSource: 'PMC Chat',
          }),
        }).catch(e => console.error('Close lead error:', e));
      }
      // Strip any ##SAVE_LEAD## token if model did emit it
      text = text.replace(/##SAVE_LEAD[^#]*##\n?/g, '').trim();
```

---

**File 2: `netlify/functions/system-prompt.js`**

**Change 1** — find:
```
- Partner interest → "Apply at pmc.splitpay.com/partners — your referral link is generated immediately."
```
Replace with:
```
- Partner interest → "You can apply right on the partners page — scroll down to the form at pmc.splitpay.com/partners#apply. Your referral link is sent within one business day."
```

**Change 2** — find:
```
Apply at pmc.splitpay.com/partners.
```
Replace with:
```
Apply at pmc.splitpay.com/partners#apply.
      text = linkifyBareUrls(text);
      data.content[0].text = text;
    }
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
