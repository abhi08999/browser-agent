'use client';
import { useState } from 'react';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [forceGoogle, setForceGoogle] = useState(false);
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState([]);
  const [scrapedData, setScrapedData] = useState({});
  const [summary, setSummary] = useState('');
  const [executionTime, setExecutionTime] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('executing');
    setResults([]);
    setScrapedData({});
    setSummary('');

    try {
      const response = await fetch('/api/automate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, forceGoogle })
      });

      const data = await response.json();
      
      if (data.success) {
        setResults(data.results);
        setScrapedData(data.scrapedData || {});
        setSummary(data.summary || '');
        setExecutionTime(data.executionTime);
        setStatus('success');
      } else {
        throw new Error(data.error || 'Request failed');
      }
    } catch (error) {
      setResults([`❌ Error: ${error.message}`]);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">AI Browser Agent</h1>
        
        <form onSubmit={handleSubmit} className="mb-8 bg-white p-6 rounded-lg shadow">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-4 border rounded-lg mb-4"
            placeholder="Try: 'Search for AI news on Google' or 'Find Mercury on Wikipedia'"
            rows={4}
          />
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="forceGoogle"
              checked={forceGoogle}
              onChange={(e) => setForceGoogle(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="forceGoogle" className="text-sm">
              Force Google search (may require CAPTCHA)
            </label>
          </div>
          <button 
            type="submit" 
            disabled={status === 'executing'}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {status === 'executing' ? 'Executing...' : 'Run Automation'}
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Execution Log</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {results.map((result, i) => (
                <div 
                  key={i} 
                  className={`p-3 rounded ${
                    result.startsWith('❌') ? 'bg-red-50 text-red-800' : 
                    result.startsWith('✅') ? 'bg-green-50 text-green-800' : 'bg-gray-50'
                  }`}
                >
                  {result}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {summary && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-4">Summary</h2>
                <div className="whitespace-pre-wrap">{summary}</div>
              </div>
            )}

            {Object.keys(scrapedData).length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-4">Scraped Data</h2>
                {Object.entries(scrapedData).map(([key, values]) => (
                  <div key={key} className="mb-4">
                    <h3 className="font-medium mb-2">{key}:</h3>
                    <ul className="list-disc pl-5">
                      {values.slice(0, 5).map((value, i) => (
                        <li key={i}>{value}</li>
                      ))}
                      {values.length > 5 && <li>...and {values.length - 5} more</li>}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {status !== 'idle' && (
          <div className="mt-6 p-4 bg-white rounded-lg shadow">
            <p>
              Status: <span className="font-medium capitalize">{status}</span> | 
              Execution Time: <span className="font-medium">{executionTime}ms</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}