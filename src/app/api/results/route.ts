import { NextResponse } from 'next/server';
import { createClient } from 'redis';

// Create Redis client
async function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    const client = createClient({ url });
    await client.connect();
    return client;
  } catch (error) {
    console.error('Redis connection error:', error);
    return null;
  }
}

// GET - Retrieve cached benchmark results
export async function GET() {
  let redis = null;
  try {
    redis = await getRedis();
    if (!redis) {
      return NextResponse.json({
        results: null,
        timestamp: null,
        message: 'Redis not configured'
      });
    }

    const resultsStr = await redis.get('benchmark-results');
    const timestampStr = await redis.get('benchmark-timestamp');

    await redis.disconnect();

    if (!resultsStr) {
      return NextResponse.json({
        results: null,
        timestamp: null,
        message: 'No cached results yet. Run the benchmark manually.'
      });
    }

    return NextResponse.json({
      results: JSON.parse(resultsStr),
      timestamp: timestampStr ? parseInt(timestampStr) : null
    });
  } catch (error) {
    console.error('Redis Error:', error);
    if (redis) await redis.disconnect().catch(() => {});
    return NextResponse.json({
      results: null,
      timestamp: null,
      message: 'Cache error'
    });
  }
}

// POST - Save results (called after manual benchmark run)
export async function POST(req: Request) {
  let redis = null;
  try {
    const { results, timestamp } = await req.json();

    redis = await getRedis();
    if (!redis) {
      return NextResponse.json({ success: true, persisted: false });
    }

    await redis.set('benchmark-results', JSON.stringify(results));
    await redis.set('benchmark-timestamp', timestamp.toString());
    await redis.disconnect();

    return NextResponse.json({ success: true, persisted: true });
  } catch (error) {
    console.error('Redis Error:', error);
    if (redis) await redis.disconnect().catch(() => {});
    return NextResponse.json({ success: true, persisted: false });
  }
}
