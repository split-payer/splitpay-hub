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
    const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Split Pay Starter Kit is here</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f0;font-family:Arial,sans-serif;">

<div style="display:none;max-height:0;overflow:hidden;color:#f5f5f0;">I'm attaching some flyers you can share with your residents right away — no integrations, nothing changes for you.</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f0;">
<tr><td align="center" style="padding:32px 16px;">

  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e8e0;">

    <!-- Logo bar -->
    <tr>
      <td style="background:#ffffff;padding:20px 32px;border-bottom:1px solid #f0f0ea;">
        <img src="https://pmc.splitpay.com/assets/logos/splitpay-logo-orange.png" alt="Split Pay" height="32" style="display:block;" />
      </td>
    </tr>

    <!-- Yellow hero -->
    <tr>
      <td style="background-color:#F7C948;padding:32px 32px 28px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#7a6000;letter-spacing:0.1em;text-transform:uppercase;">🏠 Rent Week Support Kit</p>
        <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.25;letter-spacing:-0.4px;">Everything you need<br>for rent week.</h1>
      </td>
    </tr>

    <!-- Intro -->
    <tr>
      <td style="padding:32px 32px 0;">
        <p style="margin:0 0 14px;font-size:15px;color:#1a1a1a;line-height:1.6;">Hi ${firstName},</p>
        <p style="margin:0 0 14px;font-size:15px;color:#1a1a1a;line-height:1.6;">I'm Nils — I head up Business Development at Split Pay. I'm attaching some flyers you can share with your residents right away. If you have time today, just send those out and we'll get your residents set up.</p>
        <p style="margin:0;font-size:15px;color:#1a1a1a;line-height:1.6;">We also put together a full marketing hub with everything you need:</p>
      </td>
    </tr>

    <!-- Kit Cards -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e8e8e0;border-radius:12px;overflow:hidden;">
          <tr>
            <td width="50%" valign="top" style="padding:20px;border-bottom:1px solid #e8e8e0;border-right:1px solid #e8e8e0;">
              <p style="margin:0 0 8px;font-size:18px;">📄</p>
              <p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#1a1a1a;">Resident Flyer</p>
              <p style="margin:0 0 14px;font-size:12px;color:#666;line-height:1.5;">One-page explainer in EN, ES & PT. Print-ready PDF.</p>
              <a href="https://pmc.splitpay.com" style="display:inline-block;background:#E8531A;color:#ffffff;font-size:11px;font-weight:700;padding:7px 14px;border-radius:100px;text-decoration:none;">Preview &amp; Download</a>
            </td>
            <td width="50%" valign="top" style="padding:20px;border-bottom:1px solid #e8e8e0;">
              <p style="margin:0 0 8px;font-size:18px;">✉️</p>
              <p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#1a1a1a;">Email Templates</p>
              <p style="margin:0 0 14px;font-size:12px;color:#666;line-height:1.5;">5 ready-to-send templates for launch, reminders &amp; follow-up.</p>
              <a href="https://pmc.splitpay.com" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:11px;font-weight:700;padding:7px 14px;border-radius:100px;text-decoration:none;">Preview &amp; Copy</a>
            </td>
          </tr>
          <tr>
            <td width="50%" valign="top" style="padding:20px;border-right:1px solid #e8e8e0;">
              <p style="margin:0 0 8px;font-size:18px;">💬</p>
              <p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#1a1a1a;">SMS Scripts</p>
              <p style="margin:0 0 14px;font-size:12px;color:#666;line-height:1.5;">Short, mobile-ready scripts for rent-week blasts.</p>
              <a href="https://pmc.splitpay.com" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:11px;font-weight:700;padding:7px 14px;border-radius:100px;text-decoration:none;">Preview &amp; Copy</a>
            </td>
            <td width="50%" valign="top" style="padding:20px;">
              <p style="margin:0 0 8px;font-size:18px;">🎬</p>
              <p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#1a1a1a;">Videos</p>
              <p style="margin:0 0 14px;font-size:12px;color:#666;line-height:1.5;">Explainer and ad videos ready to share with residents.</p>
              <a href="https://pmc.splitpay.com" style="display:inline-block;background:#E8531A;color:#ffffff;font-size:11px;font-weight:700;padding:7px 14px;border-radius:100px;text-decoration:none;margin-right:5px;">Explainer</a>
              <a href="https://pmc.splitpay.com" style="display:inline-block;background:#fff;color:#1a1a1a;font-size:11px;font-weight:700;padding:7px 14px;border-radius:100px;text-decoration:none;border:1px solid #1a1a1a;">Ad Videos</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- What's next -->
    <tr>
      <td style="padding:28px 32px 0;">
        <p style="margin:0 0 14px;font-size:15px;font-weight:700;color:#1a1a1a;">What's next?</p>
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:5px 0;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:top;"><span style="display:inline-block;width:20px;height:20px;background:#F7C948;border-radius:50%;text-align:center;font-size:11px;font-weight:700;color:#1a1a1a;line-height:20px;">1</span></td>
              <td style="padding-left:10px;font-size:14px;color:#1a1a1a;line-height:1.6;">Pick your favorite flyer from the attachments</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:5px 0;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:top;"><span style="display:inline-block;width:20px;height:20px;background:#F7C948;border-radius:50%;text-align:center;font-size:11px;font-weight:700;color:#1a1a1a;line-height:20px;">2</span></td>
              <td style="padding-left:10px;font-size:14px;color:#1a1a1a;line-height:1.6;">Email or print it for your residents</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:5px 0;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:top;"><span style="display:inline-block;width:20px;height:20px;background:#F7C948;border-radius:50%;text-align:center;font-size:11px;font-weight:700;color:#1a1a1a;line-height:20px;">3</span></td>
              <td style="padding-left:10px;font-size:14px;color:#1a1a1a;line-height:1.6;">Optionally, send a follow-up reminder in a few days</td>
            </tr></table>
          </td></tr>
        </table>
      </td>
    </tr>

    <!-- Reminder box -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f0;border-radius:10px;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0;font-size:13px;color:#444;line-height:1.6;"><em><strong>Reminder:</strong> Split Pay works directly with your existing building portal — no integrations, no contracts, no accounting changes. All you need to do is share the flyers. <strong>Nothing changes for you.</strong></em></p>
          </td></tr>
        </table>
      </td>
    </tr>

    <!-- Concierge CTA -->
    <tr>
      <td style="padding:16px 32px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d1f2d;border-radius:10px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#00B2A9;letter-spacing:0.07em;text-transform:uppercase;">● Split Pay Concierge</p>
            <p style="margin:0 0 14px;font-size:13px;color:#ccc;line-height:1.5;">We can send personalized invitations to every resident on your behalf. Upload your rent roll, choose email or SMS, done.</p>
            <a href="https://pmc.splitpay.com/#concierge" style="display:inline-block;border:1px solid #00B2A9;color:#00B2A9;font-size:12px;font-weight:700;padding:8px 18px;border-radius:100px;text-decoration:none;">Open Concierge →</a>
          </td></tr>
        </table>
      </td>
    </tr>

    <!-- Signature -->
    <tr>
      <td style="padding:28px 32px 24px;">
        <p style="margin:0 0 20px;font-size:15px;color:#1a1a1a;line-height:1.6;">Let me know how I can help — happy to jump on a call if that's easier.</p>
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="border-left:3px solid #F7C948;padding-left:14px;vertical-align:top;">
              <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1a1a1a;">Nils Decker</p>
              <p style="margin:0 0 10px;font-size:13px;color:#666;">Head of Business Development · Split Pay</p>
              <p style="margin:0;font-size:13px;color:#555;line-height:2;">
                <a href="tel:+13478171759" style="color:#555;text-decoration:none;">+1-347-817-1759</a><br>
                <a href="mailto:nils@splitpay.com" style="color:#E8531A;text-decoration:none;">nils@splitpay.com</a><br>
                <a href="https://linkedin.com/in/nilsdecker" style="color:#E8531A;text-decoration:none;">LinkedIn</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#f5f5f0;padding:16px 32px;border-top:1px solid #e8e8e0;">
        <p style="margin:0;font-size:11px;color:#999;line-height:1.6;">Split Pay · <a href="https://pmc.splitpay.com" style="color:#999;text-decoration:none;">pmc.splitpay.com</a> · You're receiving this because you requested the Split Pay Starter Kit.</p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>
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