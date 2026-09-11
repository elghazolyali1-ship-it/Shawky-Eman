// Vercel Serverless Function: /api/rsvp
// Handles wedding RSVP submissions and stores them in MongoDB.
//
// Required environment variable (set in Vercel dashboard -> Project -> Settings -> Environment Variables):
//   MONGODB_URI   e.g. mongodb+srv://user:password@cluster0.mongodb.net/?retryWrites=true&w=majority
//
// Optional:
//   MONGODB_DB    database name (defaults to "wedding")
//   ADMIN_KEY     a secret string; pass it as ?key=... on GET requests to list RSVPs

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
  // Basic CORS (safe to keep even if frontend is same-origin on Vercel)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const db = await connectToDatabase();
    const collection = db.collection('rsvps');

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { name, attending, guests, message } = body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'الاسم مطلوب' });
        return;
      }
      if (!['yes', 'no', 'maybe'].includes(attending)) {
        res.status(400).json({ error: 'قيمة الحضور غير صالحة' });
        return;
      }

      const doc = {
        name: name.trim().slice(0, 200),
        attending: attending,
        guests: attending === 'yes' ? Math.max(0, Math.min(20, parseInt(guests, 10) || 0)) : 0,
        message: typeof message === 'string' ? message.trim().slice(0, 1000) : '',
        createdAt: new Date(),
        userAgent: req.headers['user-agent'] || '',
      };

      const result = await collection.insertOne(doc);
      res.status(200).json({ ok: true, id: result.insertedId });
      return;
    }

    if (req.method === 'GET') {
      // Simple protection: require ?key=ADMIN_KEY to view the list of responses
      const adminKey = process.env.ADMIN_KEY;
      if (adminKey && req.query.key !== adminKey) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const rsvps = await collection
        .find({})
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();
      res.status(200).json({ ok: true, count: rsvps.length, rsvps });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('RSVP API error:', err);
    res.status(500).json({ error: 'حدث خطأ في الخادم، برجاء المحاولة لاحقًا' });
  }
};
