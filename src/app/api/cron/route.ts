import { NextResponse } from 'next/server';
import { MODELS, BENCHMARKS } from '@/lib/benchmarks';
import Groq from "groq-sdk";
import { HfInference } from '@huggingface/inference';
import { createClient } from 'redis';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

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

// Vercel Cron handler - runs every 3 hours
export async function GET(req: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('Cron job started:', new Date().toISOString());

  const redis = await getRedis();
  if (!redis) {
    return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
  }

  const results: Record<string, { output: string; type: string; timestamp: number }> = {};
  const timestamp = Date.now();

  // Load prompts
  const prompts: Record<string, string> = {};
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  for (const benchmark of BENCHMARKS) {
    try {
      const promptFile = benchmark.category === 'code' ? 'clock' : benchmark.category;
      const res = await fetch(`${baseUrl}/prompts/${promptFile}.txt`);
      if (res.ok) {
        prompts[benchmark.category] = await res.text();
      }
    } catch (e) {
      console.error(`Failed to load prompt for ${benchmark.category}:`, e);
    }
  }

  // Run all benchmarks
  for (const benchmark of BENCHMARKS) {
    const categoryModels = MODELS.filter(m => m.category === benchmark.category);
    const prompt = prompts[benchmark.category] || '';

    // Run models sequentially for image (rate limits), parallel for others
    if (benchmark.category === 'image') {
      for (const model of categoryModels) {
        const key = `${benchmark.category}-${model.id}`;
        try {
          const output = await runModel(model, prompt, benchmark.category);
          results[key] = { output, type: 'image', timestamp };
          console.log(`Completed: ${key}`);
        } catch (error) {
          results[key] = {
            output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            type: 'text',
            timestamp
          };
          console.error(`Failed: ${key}`, error);
        }
      }
    } else {
      await Promise.all(categoryModels.map(async (model) => {
        const key = `${benchmark.category}-${model.id}`;
        try {
          const output = await runModel(model, prompt, benchmark.category);
          results[key] = { output, type: 'text', timestamp };
          console.log(`Completed: ${key}`);
        } catch (error) {
          results[key] = {
            output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            type: 'text',
            timestamp
          };
          console.error(`Failed: ${key}`, error);
        }
      }));
    }
  }

  // Store results in Redis
  await redis.set('benchmark-results', JSON.stringify(results));
  await redis.set('benchmark-timestamp', timestamp.toString());
  await redis.quit();

  console.log('Cron job completed:', new Date().toISOString());

  return NextResponse.json({
    success: true,
    timestamp,
    resultsCount: Object.keys(results).length
  });
}

async function runModel(
  model: { id: string; provider: string },
  prompt: string,
  category: string
): Promise<string> {
  // Image generation
  if (category === 'image') {
    if (model.provider === 'replicate') {
      const response = await fetch(`https://api.replicate.com/v1/models/${model.id}/predictions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait=60',
        },
        body: JSON.stringify({
          input: {
            prompt: prompt,
            aspect_ratio: '1:1',
            output_format: 'jpg',
            safety_filter_level: 'block_medium_and_above',
          },
        }),
      });

      let prediction = await response.json();

      // Handle rate limiting
      if (prediction.status === 429 || prediction.detail?.includes('throttled')) {
        const retryAfter = prediction.retry_after || 10;
        await new Promise(resolve => setTimeout(resolve, (retryAfter + 1) * 1000));

        const retryResponse = await fetch(`https://api.replicate.com/v1/models/${model.id}/predictions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait=60',
          },
          body: JSON.stringify({
            input: {
              prompt: prompt,
              aspect_ratio: '1:1',
              output_format: 'jpg',
              safety_filter_level: 'block_medium_and_above',
            },
          }),
        });
        prediction = await retryResponse.json();
      }

      if (prediction.error) throw new Error(prediction.error);
      if (prediction.status === 'failed') throw new Error(prediction.error || 'Failed');

      if (prediction.output) {
        let imageUrl = '';
        if (typeof prediction.output === 'string') imageUrl = prediction.output;
        else if (Array.isArray(prediction.output)) imageUrl = prediction.output[0];
        else if (prediction.output.url) imageUrl = prediction.output.url;

        if (imageUrl) {
          // Convert to base64 to avoid URL expiration
          const imgResponse = await fetch(imageUrl);
          const arrayBuffer = await imgResponse.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
          return `data:${contentType};base64,${base64}`;
        }
      }
      throw new Error('No output from Replicate');
    }
  }

  // Text generation
  if (model.provider === 'groq') {
    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: model.id,
    });
    return response.choices[0]?.message?.content || "";
  }

  if (model.provider === 'huggingface') {
    const response = await hf.chatCompletion({
      model: model.id,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    });
    return response.choices[0]?.message?.content || "";
  }

  throw new Error(`Unknown provider: ${model.provider}`);
}
