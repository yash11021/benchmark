import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

// GET - Retrieve cached benchmark results
export async function GET() {
  try {
    const results = await kv.get('benchmark-results');
    const timestamp = await kv.get('benchmark-timestamp');

    if (!results) {
      return NextResponse.json({
        results: null,
        timestamp: null,
        message: 'No cached results yet. Run the benchmark manually or wait for the next cron job.'
      });
    }

    return NextResponse.json({
      results,
      timestamp
    });
  } catch (error) {
    // If KV is not configured, return empty results gracefully
    console.error('KV Error:', error);
    return NextResponse.json({
      results: null,
      timestamp: null,
      message: 'Cache not available'
    });
  }
}

// POST - Save results (called after manual benchmark run)
export async function POST(req: Request) {
  try {
    const { results, timestamp } = await req.json();

    await kv.set('benchmark-results', results);
    await kv.set('benchmark-timestamp', timestamp);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('KV Error:', error);
    return NextResponse.json({ error: 'Failed to save results' }, { status: 500 });
  }
}
