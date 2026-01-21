'use client';
import { useState, useEffect, useCallback } from 'react';
import { MODELS, BENCHMARKS, type BenchmarkCategory, type Model } from '@/lib/benchmarks';

type TabType = BenchmarkCategory;

interface BenchmarkResult {
  output: string;
  type: 'text' | 'image';
  timestamp: number;
  duration?: number; // execution time in ms
}

export default function BenchmarkPage() {
  const [activeTab, setActiveTab] = useState<TabType>('code');
  const [selectedModels, setSelectedModels] = useState<Record<TabType, Set<string>>>({
    code: new Set(MODELS.filter(m => m.category === 'code').map(m => `${m.category}-${m.id}`)),
    ascii: new Set(MODELS.filter(m => m.category === 'ascii').map(m => `${m.category}-${m.id}`)),
    image: new Set(MODELS.filter(m => m.category === 'image').map(m => `${m.category}-${m.id}`)),
  });
  const [prompts, setPrompts] = useState<Record<TabType, string>>({
    code: '',
    ascii: '',
    image: '',
  });
  const [results, setResults] = useState<Record<string, BenchmarkResult>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [benchmarkPassword, setBenchmarkPassword] = useState<string>('');

  // Load cached results on mount
  useEffect(() => {
    const loadCachedResults = async () => {
      try {
        const res = await fetch('/api/results');
        if (res.ok) {
          const data = await res.json();
          if (data.results) {
            setResults(data.results);
            setLastUpdated(data.timestamp);
          }
        }
      } catch (e) {
        console.error('Failed to load cached results:', e);
      }
    };

    loadCachedResults();
  }, []);

  // Load prompts from text files
  useEffect(() => {
    const loadPrompts = async () => {
      const promptFiles: Record<TabType, string> = {
        code: '/prompts/clock.txt',
        ascii: '/prompts/ascii.txt',
        image: '/prompts/image.txt',
      };

      const loadedPrompts: Record<TabType, string> = { code: '', ascii: '', image: '' };

      for (const [category, file] of Object.entries(promptFiles)) {
        try {
          const res = await fetch(file);
          if (res.ok) {
            loadedPrompts[category as TabType] = await res.text();
          }
        } catch (e) {
          console.error(`Failed to load prompt for ${category}:`, e);
        }
      }

      setPrompts(loadedPrompts);
    };

    loadPrompts();
  }, []);

  const getModelsForTab = (tab: TabType): Model[] => {
    return MODELS.filter(m => m.category === tab);
  };

  const getBenchmarkForTab = (tab: TabType) => {
    return BENCHMARKS.find(b => b.category === tab);
  };

  const toggleModel = (tab: TabType, modelKey: string) => {
    setSelectedModels(prev => {
      const newSet = new Set(prev[tab]);
      if (newSet.has(modelKey)) {
        newSet.delete(modelKey);
      } else {
        newSet.add(modelKey);
      }
      return { ...prev, [tab]: newSet };
    });
  };

  const selectAllModels = (tab: TabType) => {
    const allKeys = getModelsForTab(tab).map(m => `${m.category}-${m.id}`);
    setSelectedModels(prev => ({ ...prev, [tab]: new Set(allKeys) }));
  };

  const deselectAllModels = (tab: TabType) => {
    setSelectedModels(prev => ({ ...prev, [tab]: new Set() }));
  };

  const runBenchmark = useCallback(async () => {
    const benchmark = getBenchmarkForTab(activeTab);
    if (!benchmark) return;

    const modelsToRun = getModelsForTab(activeTab).filter(m =>
      selectedModels[activeTab].has(`${m.category}-${m.id}`)
    );

    if (modelsToRun.length === 0) return;

    // Prompt for password if not already set (only for image generation)
    let password = benchmarkPassword;
    if (activeTab === 'image' && !password) {
      password = window.prompt('Enter password for image generation:') || '';
      if (!password) return; // User cancelled
      setBenchmarkPassword(password);
    }

    setLoading(true);
    setProgress({ current: 0, total: modelsToRun.length });

    const prompt = prompts[activeTab];
    const timestamp = Date.now();
    const newResults: Record<string, BenchmarkResult> = {};

    const runModelRequest = async (model: Model) => {
      const key = `${activeTab}-${model.id}`;
      const startTime = Date.now();
      try {
        const res = await fetch('/api/benchmark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.id,
            provider: model.provider,
            prompt: prompt,
            type: activeTab === 'image' ? 'image' : 'text',
            password,
          }),
        });
        const data = await res.json();
        const duration = Date.now() - startTime;

        // If unauthorized, clear password so user is prompted again
        if (res.status === 401) {
          setBenchmarkPassword('');
          throw new Error('Invalid password');
        }

        newResults[key] = {
          output: data.output || data.error || 'No output',
          type: data.type || 'text',
          timestamp,
          duration,
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        newResults[key] = {
          output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          type: 'text',
          timestamp,
          duration,
        };
      }

      setProgress(prev => ({ ...prev, current: prev.current + 1 }));
    };

    // Image models run sequentially to avoid rate limits
    // Code/ASCII models run in parallel for speed
    if (activeTab === 'image') {
      for (const model of modelsToRun) {
        await runModelRequest(model);
      }
    } else {
      await Promise.all(modelsToRun.map(runModelRequest));
    }

    // Now update results all at once
    const allResults = { ...results, ...newResults };
    setResults(allResults);
    setLastUpdated(timestamp);
    setLoading(false);
    setProgress({ current: 0, total: 0 });

    // Save to cache (fire and forget)
    fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: allResults, timestamp }),
    }).catch(console.error);
  }, [activeTab, selectedModels, prompts, results]);

  const renderOutput = (model: Model) => {
    const key = `${activeTab}-${model.id}`;
    const result = results[key];

    if (!result) {
      return <div className="text-gray-500 italic flex items-center justify-center h-full">Waiting for execution...</div>;
    }

    // Code output - render in iframe
    if (activeTab === 'code') {
      // Extract HTML content if wrapped in markdown code blocks
      let htmlContent = result.output;
      const htmlMatch = htmlContent.match(/```html?\s*([\s\S]*?)```/);
      if (htmlMatch) {
        htmlContent = htmlMatch[1];
      }

      return (
        <iframe
          srcDoc={htmlContent}
          className="w-full h-full border-0 bg-gray-900 rounded"
          title={`${model.name} output`}
          sandbox="allow-scripts"
        />
      );
    }

    // ASCII output - render as preformatted text
    if (activeTab === 'ascii') {
      return (
        <pre className="whitespace-pre font-mono text-xs text-green-400 overflow-auto h-full p-2 leading-tight">
          {result.output}
        </pre>
      );
    }

    // Image output - render as image
    if (activeTab === 'image' && result.type === 'image') {
      return (
        <div className="flex items-center justify-center h-full p-2">
          <img
            src={result.output}
            alt={`${model.name} generated`}
            className="max-w-full max-h-full object-contain rounded"
          />
        </div>
      );
    }

    // Fallback for errors or text
    return (
      <pre className="whitespace-pre-wrap font-mono text-xs text-red-400 overflow-auto h-full p-2">
        {result.output}
      </pre>
    );
  };

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'code', label: 'Code (Clock)', icon: '⏰' },
    { id: 'ascii', label: 'ASCII Art', icon: '🎨' },
    { id: 'image', label: 'Image Gen', icon: '🖼️' },
  ];

  const currentModels = getModelsForTab(activeTab);
  const selectedCount = selectedModels[activeTab].size;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                LLM Benchmark Arena
              </h1>
              <p className="text-sm text-gray-400 mt-1 max-w-md">
                Visually compare popular models side-by-side on code generation, ASCII art, and image generation.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {lastUpdated && !loading && (
                <div className="text-xs text-gray-500">
                  Last updated: {new Date(lastUpdated).toLocaleString()}
                </div>
              )}
              {loading && (
                <div className="text-sm text-gray-400">
                  Progress: {progress.current}/{progress.total}
                </div>
              )}
              <button
                onClick={runBenchmark}
                disabled={loading || selectedCount === 0}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500
                           px-6 py-2 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200 shadow-lg shadow-blue-500/20"
              >
                {loading ? `Running ${progress.current}/${progress.total}...` : `Run Benchmark (${selectedCount})`}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-t-lg font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Prompt Editor */}
        <div className="mb-6 bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">
              Prompt (edit in <code className="text-blue-400">/public/prompts/{activeTab === 'code' ? 'clock' : activeTab}.txt</code>)
            </label>
            <button
              onClick={async () => {
                const file = `/prompts/${activeTab === 'code' ? 'clock' : activeTab}.txt`;
                const res = await fetch(file);
                if (res.ok) {
                  setPrompts(prev => ({ ...prev, [activeTab]: '' }));
                  const text = await res.text();
                  setPrompts(prev => ({ ...prev, [activeTab]: text }));
                }
              }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Reload from file
            </button>
          </div>
          <textarea
            value={prompts[activeTab]}
            onChange={(e) => setPrompts(prev => ({ ...prev, [activeTab]: e.target.value }))}
            className="w-full h-24 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm font-mono
                       focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Loading prompt..."
          />
        </div>

        {/* Model Selection */}
        <div className="mb-6 bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-300">Select Models</h3>
            <div className="flex gap-2">
              <button
                onClick={() => selectAllModels(activeTab)}
                className="text-xs px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
              >
                Select All
              </button>
              <button
                onClick={() => deselectAllModels(activeTab)}
                className="text-xs px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
              >
                Deselect All
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentModels.map(model => {
              const key = `${model.category}-${model.id}`;
              const isSelected = selectedModels[activeTab].has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleModel(activeTab, key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {model.name}
                  <span className="ml-2 text-xs opacity-60">({model.provider})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Results Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentModels
            .filter(m => selectedModels[activeTab].has(`${m.category}-${m.id}`))
            .map(model => (
              <div
                key={`${model.category}-${model.id}`}
                className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden flex flex-col"
                style={{ height: '400px' }}
              >
                {/* Card Header */}
                <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-white">{model.name}</h4>
                    <span className="text-xs text-gray-500">{model.provider}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {results[`${activeTab}-${model.id}`]?.duration && (
                      <span className="text-xs text-gray-400">
                        {(results[`${activeTab}-${model.id}`].duration! / 1000).toFixed(1)}s
                      </span>
                    )}
                    {loading && selectedModels[activeTab].has(`${model.category}-${model.id}`) && (
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                </div>

                {/* Card Content - Fixed Height */}
                <div className="flex-1 overflow-hidden bg-gray-950">
                  {renderOutput(model)}
                </div>
              </div>
            ))}
        </div>

        {selectedCount === 0 && (
          <div className="text-center py-12 text-gray-500">
            Select at least one model to run the benchmark
          </div>
        )}
      </div>
    </main>
  );
}
