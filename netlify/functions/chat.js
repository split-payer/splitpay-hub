// netlify/functions/chat.js
const { SPLIT_PAY_KNOWLEDGE } = require('./system-prompt');

function linkifyBareUrls(text) {
  return text.replace(
    /(https?:\/\/[^\s<>".,!?]+|(?<![/@\w])(?:pmc\.splitpay\.com|rent\.app\/go|splitpay\.com)(?:\/[^\s<>".,!?]*)?)/gi,
    (url) => {
      const href = url.startsWith('http') ? url : 'https://' + url;
      return '<a href="' + href + '" style="color:inherit;text-decoration:underline;font-weight:600;">' + url + '</a>';
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

      // Detect email directly from user messages — no model cooperation needed
      const allUserText = (body.messages || [])
        .filter(m => m.role === 'user')
        .map(m => m.content).join(' ');
      const emailMatch = allUserText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        const detectedEmail = emailMatch[0];

        // Extract first/last name
        const nameMatch = allUserText.match(/(?:my name is|i'?m|i am)\s+([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)/i)
          || allUserText.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)?)[\s,.!?]*$/m);
        const detectedName = nameMatch ? nameMatch[1].trim() : '';
        const phoneMatch = allUserText.match(/(\+?1?\s?[\.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/);
        const detectedPhone = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : null;

        // Extract company — look for explicit company/property patterns only
        const emailCompanyMatch = allUserText.match(new RegExp(detectedEmail.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '[,\\s-]+([A-Za-z0-9][A-Za-z0-9\\s&\'\.\\-]{2,40}?)(?:\\s*(?:ok|sure|bye|yes|no|thanks|great|got it|sounds|perfect)[^a-z]|\\s*[.,]|\\s*$)', 'i'));
        const detectedCompany = emailCompanyMatch ? emailCompanyMatch[1].trim() : '';

        // Extract unit count — look for numbers near "door/unit/apartment" mentions
        const unitMatch = allUserText.match(/(?:about|around|roughly|~)?\s*(\d[\d,]*)\s*(?:units?|doors?|apartments?|homes?|properties)/i);
        const detectedUnits = unitMatch ? parseInt(unitMatch[1].replace(/,/g, '')) : null;

        // Extract PMS — look for known PMS names
        const PMS_LIST = ['Entrata','Yardi','AppFolio','RealPage','Buildium','ResMan','MRI','Rent Manager','Propertyware','TenantCloud','DoorLoop','Hemlane','Rentec'];
        const detectedPms = PMS_LIST.find(p => allUserText.toLowerCase().includes(p.toLowerCase())) || '';
        const flexYes = /\b(?:yes|using|use|we use|already use|currently use)[^\n.]{0,30}flex\b|\bflex[^\n.]{0,30}(?:yes|we do|currently|already)\b/i.test(allUserText);
        const flexNo = /\b(?:no|not|don'?t|do not|not using|never)[^\n.]{0,30}flex\b|\bflex[^\n.]{0,30}(?:no|not|don'?t)\b/i.test(allUserText);
        const detectedFlex = flexYes ? 'Yes' : flexNo ? 'No' : null;

        const closeUrl = 'https://' + event.headers.host + '/api/submit-to-close';
        try {
          await fetch(closeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              formType: 'chat',
              firstName: detectedName.split(' ')[0] || '',
              lastName: detectedName.split(' ').slice(1).join(' ') || '',
              fullName: detectedName || '',
              email: detectedEmail,
              company: detectedCompany,
              pms: detectedPms,
              flexUser: detectedFlex,
              unitCount: detectedUnits,
            }),
          });
        } catch (e) {
          console.error('Close lead error:', e);
        }
      }

      // Strip any ##SAVE_LEAD## token if model emitted it
      text = text.replace(/##SAVE_LEAD[^#]*##\n?/g, '').trim();
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
