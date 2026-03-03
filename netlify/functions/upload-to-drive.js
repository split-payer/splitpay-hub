// netlify/functions/upload-to-drive.js
const { google } = require('googleapis');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!FOLDER_ID || !SERVICE_ACCOUNT_JSON) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Google env vars' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { fileName, fileBase64, mimeType } = body;
  if (!fileName || !fileBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing fileName or fileBase64' }) };
  }

  try {
    const credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const { Readable } = require('stream');
    const stream = Readable.from(fileBuffer);

    const uploaded = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [FOLDER_ID],
        driveId: FOLDER_ID,
      },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: stream,
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        fileId: uploaded.data.id,
        url: uploaded.data.webViewLink,
      }),
    };
  } catch (err) {
    console.error('Drive upload error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};