export type BenchmarkCategory = 'code' | 'ascii' | 'image';

export interface BenchmarkTask {
  id: string;
  title: string;
  promptFile: string; // Path to prompt text file
  category: BenchmarkCategory;
}

export interface Model {
  id: string;
  name: string;
  provider: 'groq' | 'huggingface' | 'openai' | 'together' | 'replicate';
  category: BenchmarkCategory; // Which tab this model belongs to
}

// Benchmark definitions - prompts loaded from text files
export const BENCHMARKS: BenchmarkTask[] = [
  {
    id: 'clock',
    title: 'Functional Clock',
    promptFile: '/prompts/clock.txt',
    category: 'code'
  },
  {
    id: 'ascii-art',
    title: 'ASCII Art',
    promptFile: '/prompts/ascii.txt',
    category: 'ascii'
  },
  {
    id: 'image-gen',
    title: 'Image Generation',
    promptFile: '/prompts/image.txt',
    category: 'image'
  }
];

// All available models organized by category
export const MODELS: Model[] = [
  // === CODE MODELS ===
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'groq', category: 'code' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', provider: 'groq', category: 'code' },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'groq', category: 'code' },
  { id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct', name: 'Qwen 3 Coder', provider: 'huggingface', category: 'code' },
  { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', provider: 'huggingface', category: 'code' },

  // === ASCII MODELS ===
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'groq', category: 'ascii' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', provider: 'groq', category: 'ascii' },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'groq', category: 'ascii' },
  { id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct', name: 'Qwen 3 Coder', provider: 'huggingface', category: 'ascii' },
  { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', provider: 'huggingface', category: 'ascii' },

  // === IMAGE MODELS (Replicate) ===
  { id: 'google/imagen-4', name: 'Imagen 4', provider: 'replicate', category: 'image' },
  { id: 'black-forest-labs/flux-kontext-pro', name: 'FLUX Kontext Pro', provider: 'replicate', category: 'image' },
  { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro', provider: 'replicate', category: 'image' },
];

// Helper to get models by category
export const getModelsByCategory = (category: BenchmarkCategory): Model[] => {
  return MODELS.filter(m => m.category === category);
};

// Helper to get benchmark by category
export const getBenchmarkByCategory = (category: BenchmarkCategory): BenchmarkTask | undefined => {
  return BENCHMARKS.find(b => b.category === category);
};
