// netlify/functions/submit-to-close.js

const CF = {
  leadSource:         'cf_yABHaHWbML9hNEy77Mu4QlWthjf3LXLkSobSkEgFgVO',
  pms:                'cf_gTwvG5VGF2RZhgzu1mUvQri0QiBM5FpPtOLj2SFcRj1',
  propertyName:       'cf_BugPKaXenAmkMdymXvrwMBR9jcNLII5EBLuoR5HF85J',
  propertyAddress:    'cf_vltfxti7afKgf3mnhoodIOulv2wcMytEqfDMfqZtXPB',
  conciergeChannel:   'cf_JXm6UvEEHIwkXySm3XQdeMTrjUgv25gnvkeSFZdU5Go',
  conciergeRequested: 'cf_IqQ1s9ZshyYPq60cEdSGPTVGV3zcFrrqyK0wXvw8nkm',
  totalUnits:         'cf_5HP7O9bC0L2Evm71ibnEOMg3VcuedBmj7w0Xq78sfOL',
  kitDownloaded:      'cf_PACYZMcqEhj64C9CodO5VKS7sVcmly92zDwZcHuvJCH',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const CLOSE_API_KEY = process.env.CLOSE_API_KEY;
  if (!CLOSE_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing CLOSE_API_KEY' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const {
    formType, firstName, lastName, company, firm, email, phone,
    pms, unitCount, propertyName, propertyAddress, channel,
    hasRentRoll, rentRollName, rentRollDriveUrl, rentRollRowCount,
  } = body;

  const name = `${firstName || ''} ${lastName || ''}`.trim();
  const companyName = company || firm || '';
  const authHeader = 'Basic ' + Buffer.from(`${CLOSE_API_KEY}:`).toString('base64');

  let existingLeadId = null;
  if (email) {
    try {
      const searchRes = await fetch(
        `https://api.close.com/api/v1/lead/?query=${encodeURIComponent(`email:"${email}"`)}`,
        { headers: { Authorization: authHeader, Accept: 'application/json' } }
      );
      const searchData = await searchRes.json();
      if (searchData.data && searchData.data.length > 0) {
        existingLeadId = searchData.data[0].id;
      }
    } catch (err) {
      console.error('Lead search error:', err);
    }
  }

  const customFields = {
    [CF.leadSource]:         formType === 'kit' ? 'PMC Kit Download' : 'PMC Concierge',
    [CF.pms]:                pms || null,
    [CF.propertyName]:       propertyName || null,
    [CF.propertyAddress]:    propertyAddress || null,
    [CF.conciergeChannel]:   channel || null,
    [CF.conciergeRequested]: formType === 'concierge' ? 'Yes' : null,
    [CF.totalUnits]:         unitCount || null,
    [CF.kitDownloaded]:      formType === 'kit' ? 'Yes' : null,
  };

  Object.keys(customFields).forEach((k) => {
    if (customFields[k] === null) delete customFields[k];
  });

  let leadId;

  if (existingLeadId) {
    const updateRes = await fetch(`https://api.close.com/api/v1/lead/${existingLeadId}/`, {
      method: 'PUT',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        ...(companyName ? { name: companyName } : {}),
        ...customFields,
      }),
    });
    if (!updateRes.ok) console.error('Lead update failed:', await updateRes.text());
    leadId = existingLeadId;
  } else {
    const leadRes = await fetch('https://api.close.com/api/v1/lead/', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: companyName || name || 'Split Pay PMC Lead',
        contacts: [{
          name,
          emails: email ? [{ type: 'work', email }] : [],
          phones: phone ? [{ type: 'mobile', phone }] : [],
        }],
        status: 'New Lead',
        ...customFields,
      }),
    });
    const lead = await leadRes.json();
    if (!leadRes.ok) return { statusCode: 502, body: JSON.stringify({ error: 'Close API error', detail: lead }) };
    leadId = lead.id;
  }

  if (formType === 'kit') {
    await fetch('https://api.close.com/api/v1/activity/note/', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        lead_id: leadId,
        note: `Kit downloaded via pmc.splitpay.com`,
      }),
    });
  }

  const oppValue = rentRollRowCount
    ? rentRollRowCount * 100
    : unitCount ? parseInt(unitCount, 10) * 100 : null;

  const oppRes = await fetch('https://api.close.com/api/v1/opportunity/', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      lead_id: leadId,
      status_type: 'active',
      status_label: 'Interested',
      note: buildNote(body),
      ...(oppValue ? { value: oppValue, value_period: 'annual' } : {}),
    }),
  });
  const opp = await oppRes.json();
  if (!oppRes.ok) console.error('Opportunity creation failed:', JSON.stringify(opp));

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, leadId, oppId: opp.id || null, wasExisting: !!existingLeadId }),
  };
};

function buildNote(data) {
  const lines = [`Form Type: ${data.formType}`];
  if (data.company || data.firm) lines.push(`Company: ${data.company || data.firm}`);
  if (data.unitCount) lines.push(`Unit Count: ${data.unitCount}`);
  if (data.pms) lines.push(`PMS: ${data.pms}`);
  if (data.propertyName) lines.push(`Property: ${data.propertyName}`);
  if (data.propertyAddress) lines.push(`Address: ${data.propertyAddress}`);
  if (data.channel) lines.push(`Channel: ${data.channel}`);
  if (data.hasRentRoll) {
    lines.push(`Rent Roll: ${data.rentRollName || 'Uploaded'}`);
    if (data.rentRollRowCount) lines.push(`Rent Roll Row Count: ${data.rentRollRowCount}`);
    if (data.rentRollDriveUrl) lines.push(`Rent Roll Link: ${data.rentRollDriveUrl}`);
  }
  return lines.join('\n');
}

