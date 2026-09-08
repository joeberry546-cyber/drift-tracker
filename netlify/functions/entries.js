const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'drift-entries';
const KEY = 'entries.json';

function getEntriesStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: STORE_NAME, siteID, token });
  }
  return getStore(STORE_NAME);
}

exports.handler = async (event) => {
  const store = getEntriesStore();

  if (event.httpMethod === 'GET') {
    const data = (await store.get(KEY, { type: 'json' })) || [];
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  }

  if (event.httpMethod === 'POST') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (err) {
      return { statusCode: 400, body: JSON.stringify({ error: 'invalid json' }) };
    }

    const value = Number(payload.value);
    if (!Number.isInteger(value) || value < 1 || value > 7) {
      return { statusCode: 400, body: JSON.stringify({ error: 'value must be an integer 1-7' }) };
    }

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      value,
      note: typeof payload.note === 'string' ? payload.note.slice(0, 500) : '',
      timestamp: payload.timestamp && !isNaN(Date.parse(payload.timestamp))
        ? new Date(payload.timestamp).toISOString()
        : new Date().toISOString(),
    };

    const data = (await store.get(KEY, { type: 'json' })) || [];
    data.push(entry);
    await store.setJSON(KEY, data);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    };
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
};
