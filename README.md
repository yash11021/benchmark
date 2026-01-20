# LLM Benchmark Arena

A real-time benchmarking dashboard that compares AI model outputs side-by-side across code generation, ASCII art, and image generation tasks.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwind-css)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel)

## Overview

Visually compare how different LLMs and image generation models respond to identical prompts. Useful for evaluating model capabilities, output quality, and consistency across providers.

### Features

- **Three Benchmark Categories**
  - **Code Generation** - Models generate a functional analog clock in HTML/CSS/JS, rendered live in iframes
  - **ASCII Art** - Models create text-based artwork displayed in monospace format
  - **Image Generation** - SOTA diffusion models generate images from text prompts

- **Interactive Model Selection** - Toggle models on/off to customize comparison grids

- **Editable Prompts** - Modify prompts via the UI or edit source text files directly

- **Batch Execution** - Results appear simultaneously after all models complete for fair comparison

- **Rate Limit Handling** - Automatic retry logic with sequential execution for image models

## Supported Models

### Code & ASCII Models
| Model | Provider |
|-------|----------|
| GPT-OSS 120B | Groq |
| Llama 4 Scout | Groq |
| Llama 3.3 70B | Groq |
| Qwen 3 Coder | Hugging Face |
| DeepSeek V3 | Hugging Face |

### Image Generation Models
| Model | Provider |
|-------|----------|
| Imagen 4 | Replicate |
| FLUX Kontext Pro | Replicate |
| FLUX 1.1 Pro | Replicate |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Deployment**: Vercel
- **AI Providers**: Groq, Hugging Face, Replicate

## Getting Started

### Prerequisites

- Node.js 18+
- API keys for desired providers

### Installation

```bash
git clone https://github.com/yourusername/llm-benchmark-arena.git
cd llm-benchmark-arena
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
GROQ_API_KEY=your_groq_api_key
HUGGINGFACE_API_KEY=your_huggingface_api_key
REPLICATE_API_TOKEN=your_replicate_api_token
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Customization

### Adding Models

Edit `src/lib/benchmarks.ts`:

```typescript
{ id: 'model-id', name: 'Display Name', provider: 'provider', category: 'code' }
```

### Modifying Prompts

Edit files in `public/prompts/`:
- `clock.txt` - Code generation prompt
- `ascii.txt` - ASCII art prompt
- `image.txt` - Image generation prompt

## Project Structure

```
src/
├── app/
│   ├── api/benchmark/route.ts   # Multi-provider API endpoint
│   ├── page.tsx                 # Dashboard UI
│   └── layout.tsx
├── lib/
│   └── benchmarks.ts            # Model & benchmark config
public/
└── prompts/                     # Editable prompt files
```

## License

MIT
