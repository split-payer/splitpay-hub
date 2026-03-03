// netlify/functions/send-kit-email.js

const DRIVE_ROOT_FOLDER_ID = '0AO78RwebC9eeUk9PVA';
const FLYERS_FOLDER_NAME = 'Flyers';
const KIT_FOLDER_NAME = 'Kit';
const MORE_FOLDER_NAME = 'more';

async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');
  const jwt = `${header}.${payload}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Failed to get Google access token: ' + JSON.stringify(tokenData));
  return tokenData.access_token;
}

async function findFolder(token, parentId, name) {
  const q = encodeURIComponent(`'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

async function listFiles(token, folderId, namePrefix) {
  const q = encodeURIComponent(`'${folderId}' in parents and name contains '${namePrefix}' and mimeType='application/pdf' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)&orderBy=name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.files || [];
}

async function downloadFile(token, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

async function getFolderWebLink(token, folderId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=webViewLink&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.webViewLink || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!SENDGRID_API_KEY || !GOOGLE_SERVICE_ACCOUNT_JSON) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing environment variables' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { firstName, email } = body;
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing email' }) };
  }

  try {
    const serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const token = await getGoogleAccessToken(serviceAccount);

    const kitFolder = await findFolder(token, DRIVE_ROOT_FOLDER_ID, KIT_FOLDER_NAME);
    if (!kitFolder) throw new Error('Kit folder not found');

    const flyersFolder = await findFolder(token, kitFolder.id, FLYERS_FOLDER_NAME);
    if (!flyersFolder) throw new Error('Flyers folder not found');

    const moreFolder = await findFolder(token, flyersFolder.id, MORE_FOLDER_NAME);

    const currentFlyers = await listFiles(token, flyersFolder.id, 'current-flyer-en-');
    if (currentFlyers.length === 0) throw new Error('No current flyers found');

    const attachments = await Promise.all(
      currentFlyers.map(async (file) => ({
        content: await downloadFile(token, file.id),
        filename: file.name,
        type: 'application/pdf',
        disposition: 'attachment',
      }))
    );

    const moreFlyersLink = moreFolder ? await getFolderWebLink(token, moreFolder.id) : null;
    const moreFlyersSection = moreFlyersLink
      ? `<p style="margin-top:16px;">Don't like these designs? <a href="${moreFlyersLink}" style="color:#00B2A9;">Browse more flyer options here →</a></p>`
      : '';

    const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
    const htmlBody = `
      <div style="font-family: sans-serif; font-size: 15px; color: #1a1a1a; max-width: 600px;">
        <p>${greeting}</p>
        <p>Here's your Split Pay Starter Kit — I've attached the latest flyers for your residents. Print them, post them, or forward this email to your team.</p>
        <p>A few quick things you can do right now:</p>
        <ul>
          <li>Post the flyers in common areas or include them with lease renewals</li>
          <li>Use the SMS scripts and email templates to reach out to residents directly</li>
          <li>Set up resident invites via the <a href="https://pmc.splitpay.com/#concierge" style="color:#00B2A9;">Split Pay Concierge</a></li>
        </ul>
        ${moreFlyersSection}
        <p style="margin-top:24px;">Need Spanish or Portuguese versions? <a href="https://drive.google.com/drive/folders/${flyersFolder.id}" style="color:#00B2A9;">Download them here →</a></p>
        <p style="margin-top:24px;">Reply to this email if you have any questions — I'm happy to help.</p>
        <p>Nils<br>
        <span style="color:#888; font-size:13px;">Split Pay · <a href="https://pmc.splitpay.com" style="color:#888;">pmc.splitpay.com</a></span></p>
      </div>
    `;

    const textBody = `${greeting}

Here's your Split Pay Starter Kit — I've attached the latest flyers for your residents.

A few quick things you can do right now:
- Post the flyers in common areas or include them with lease renewals
- Use the SMS scripts and email templates to reach out to residents directly
- Set up resident invites via the Split Pay Concierge: https://pmc.splitpay.com/#concierge

Need Spanish or Portuguese versions? Download them here: https://drive.google.com/drive/folders/${flyersFolder.id}

Reply if you have any questions.

Nils
Split Pay · pmc.splitpay.com`;

    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: 'pm-support@o.splitpay.com', name: 'Nils at Split Pay' },
        reply_to: { email: 'pm-support@o.splitpay.com', name: 'Nils at Split Pay' },
        subject: "Your Split Pay Starter Kit is here",
        content: [
          { type: 'text/plain', value: textBody },
          { type: 'text/html', value: htmlBody },
        ],
        attachments,
      }),
    });

    if (!sgRes.ok) {
      const err = await sgRes.text();
      console.error('SendGrid error:', err);
      return { statusCode: 502, body: JSON.stringify({ error: 'SendGrid error', detail: err }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('send-kit-email error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
