// Vercel Serverless Function: /api/view
// Tracks how many people opened the invitation page and lets the admin
// dashboard read the total count.
//
// Required environment variable (same as /api/rsvp):
//   MONGODB_URI
// Optional:
//   MONGODB_DB
//   ADMIN_KEY     pass it as ?key=... on GET requests to read the count

const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  if (!cachedClient) {
    cachedClient = new MongoClient(uri);
    await cachedClient.connect();
  }

  const dbName = process.env.MONGODB_DB || 'wedding';
  cachedDb = cachedClient.db(dbName);
  return cachedDb;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const db = await connectToDatabase();
    const collection = db.collection('views');

    if (req.method === 'POST') {
      await collection.insertOne({
        createdAt: new Date(),
        userAgent: req.headers['user-agent'] || '',
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'GET') {
      const adminKey = process.env.ADMIN_KEY;
      if (adminKey && req.query.key !== adminKey) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const count = await collection.countDocuments({});
      res.status(200).json({ ok: true, count });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('View API error:', err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
};
