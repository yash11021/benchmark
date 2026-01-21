import { NextResponse } from 'next/server';
import Groq from "groq-sdk";
import { HfInference } from '@huggingface/inference';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

export async function POST(req: Request) {
  const { provider, model, prompt, type, password } = await req.json();

  // Check password only for image generation if BENCHMARK_PASSWORD is set
  const requiredPassword = process.env.BENCHMARK_PASSWORD;
  if (type === 'image' && requiredPassword && password !== requiredPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  try {
    // === IMAGE GENERATION ===
    if (type === 'image') {
      let imageUrl = '';

      if (provider === 'together') {
        // Together AI image generation
        const response = await fetch('https://api.together.xyz/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            prompt: prompt,
            width: 512,
            height: 512,
            steps: 20,
            n: 1,
            response_format: 'b64_json',
          }),
        });
        const data = await response.json();
        if (data.data?.[0]?.b64_json) {
          imageUrl = `data:image/png;base64,${data.data[0].b64_json}`;
        } else if (data.data?.[0]?.url) {
          imageUrl = data.data[0].url;
        }
      }
      else if (provider === 'replicate') {
        // Replicate image generation using the models API (for official models)
        // Uses format: https://api.replicate.com/v1/models/{owner}/{name}/predictions
        const response = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait=60', // Wait up to 60 seconds for the result
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

        // Log for debugging
        console.log('Replicate response:', JSON.stringify(prediction, null, 2));

        // Handle rate limiting with retry
        if (prediction.status === 429 || prediction.detail?.includes('throttled')) {
          const retryAfter = prediction.retry_after || 10;
          console.log(`Rate limited, waiting ${retryAfter}s...`);
          await new Promise(resolve => setTimeout(resolve, (retryAfter + 1) * 1000));

          // Retry the request
          const retryResponse = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
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
          console.log('Replicate retry response:', JSON.stringify(prediction, null, 2));
        }

        // Check for API errors
        if (prediction.error) {
          throw new Error(prediction.error);
        }

        // Check status - with Prefer: wait, should already be succeeded
        if (prediction.status === 'failed') {
          throw new Error(prediction.error || 'Replicate prediction failed');
        }

        // Handle output - can be a URL string, an array of URLs, or an object
        if (prediction.output) {
          if (typeof prediction.output === 'string') {
            imageUrl = prediction.output;
          } else if (Array.isArray(prediction.output)) {
            imageUrl = prediction.output[0];
          } else if (typeof prediction.output === 'object' && prediction.output.url) {
            imageUrl = prediction.output.url;
          }
        } else {
          throw new Error('No output received from Replicate');
        }
      }
      else if (provider === 'huggingface') {
        // Hugging Face image generation
        const response = await hf.textToImage({
          model: model,
          inputs: prompt,
          parameters: {
            width: 512,
            height: 512,
          },
        });
        // Response can be Blob or string depending on HF SDK version
        if (typeof response === 'string') {
          // Already a URL or base64 string
          imageUrl = response.startsWith('data:') ? response : `data:image/png;base64,${response}`;
        } else {
          // Blob response - convert to base64
          const blob = response as unknown as Blob;
          const buffer = await blob.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          imageUrl = `data:image/png;base64,${base64}`;
        }
      }

      return NextResponse.json({ output: imageUrl, type: 'image' });
    }

    // === TEXT GENERATION (code, ascii) ===
    let result = '';

    if (provider === 'groq') {
      const response = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: model,
      });
      result = response.choices[0]?.message?.content || "";
    }
    else if (provider === 'huggingface') {
      const response = await hf.chatCompletion({
        model: model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
      });
      result = response.choices[0]?.message?.content || "";
    }
    else if (provider === 'openai') {
      // OpenAI-compatible endpoint (if you add it later)
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2048,
        }),
      });
      const data = await response.json();
      result = data.choices?.[0]?.message?.content || "";
    }
    else if (provider === 'together') {
      // Together AI text generation
      const response = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2048,
        }),
      });
      const data = await response.json();
      result = data.choices?.[0]?.message?.content || "";
    }

    return NextResponse.json({ output: result, type: 'text' });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error("Provider Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
