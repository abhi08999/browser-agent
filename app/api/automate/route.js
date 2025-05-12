import { OpenAI } from 'openai';
import { chromium } from 'playwright';

let _browser = null;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
];

async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({ 
      headless: false,
      timeout: 30000,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-position=0,0'
      ]
    });
  }
  return _browser;
}

async function handleGoogleSearch(page, query, results) {
  try {
    // Navigate to Google
    await page.goto('https://www.google.com', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    // Try to accept cookies
    try {
      await page.click('button:has-text("Accept all")', { timeout: 2000 });
      results.push('✅ Accepted cookies');
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      results.push('⚠️ No cookie banner found');
    }

    // Type search query with human-like delays
    const searchBox = await page.waitForSelector('textarea[name="q"]');
    await searchBox.click();
    await new Promise(r => setTimeout(r, 500));
    
    for (const char of query.split('')) {
      await searchBox.type(char, { delay: 50 + Math.random() * 100 });
    }
    results.push('🔍 Typed search query');

    // Press Enter with delay
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    await searchBox.press('Enter');
    results.push('↵ Executed search');

    // Wait for results
    await page.waitForSelector('#search', { timeout: 10000 });

    // Click first non-ad result
    const firstResult = await page.$('a:has(h3) >> nth=0');
    if (firstResult) {
      await new Promise(r => setTimeout(r, 1000));
      await firstResult.click();
      results.push('🖱️ Clicked first organic result');
      await page.waitForLoadState('networkidle');
      return true;
    }

    throw new Error('No search results found');
  } catch (error) {
    results.push(`❌ Google search failed: ${error.message}`);
    return false;
  }
}

export async function POST(request) {
  const startTime = Date.now();
  const { prompt, forceGoogle } = await request.json();
  const openai = new OpenAI(process.env.OPENAI_API_KEY);
  
  try {
    const browser = await getBrowser();
    
    // Create context with user agent first
    const context = await browser.newContext({
      userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
    });
    
    const page = await context.newPage();
    const results = [];
    const scrapedData = {};

    // Apply stealth settings
    await context.addInitScript(() => {
      delete Object.getPrototypeOf(navigator).webdriver;
    });
    
    // Set viewport on the page
    await page.setViewportSize({
      width: 1200 + Math.floor(Math.random() * 300),
      height: 800 + Math.floor(Math.random() * 300)
    });

    // Determine if we should force Google
    const useGoogle = forceGoogle || prompt.toLowerCase().includes('google');

    if (useGoogle) {
      const searchQuery = prompt.replace(/google/gi, '').trim();
      const success = await handleGoogleSearch(page, searchQuery, results);
      
      if (!success) {
        results.push('⚠️ Falling back to DuckDuckGo');
        await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}`);
      }
    } else {
      // Use AI to determine actions for non-Google requests
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [{
          role: "system",
          content: `Generate browser automation steps. Respond with JSON: {
            "actions": [{
              "type": "navigation|click|fill|scrape|wait",
              "details": {...}
            }],
            "summarize": boolean
          }`
        }, { 
          role: "user", 
          content: prompt 
        }],
        response_format: { type: "json_object" }
      });

      const { actions = [], summarize = false } = JSON.parse(aiResponse.choices[0].message.content);

      for (const action of actions) {
        const actionStart = Date.now();
        try {
          await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

          switch (action.type) {
            case 'navigation':
              await page.goto(action.details.url, { 
                waitUntil: 'domcontentloaded',
                timeout: 15000
              });
              results.push(`🌐 Navigated to ${action.details.url}`);
              break;

            case 'click':
              await page.click(action.details.selector, {
                delay: 50 + Math.random() * 100
              });
              results.push(`🖱️ Clicked ${action.details.selector}`);
              break;

            case 'fill':
              await page.fill(action.details.selector, action.details.value, {
                delay: 30 + Math.random() * 70
              });
              results.push(`📝 Filled ${action.details.selector}`);
              break;

            case 'scrape':
              scrapedData[action.details.as] = await page.$$eval(
                action.details.selector, 
                els => els.map(el => el.textContent?.trim())
              );
              results.push(`🧹 Scraped ${scrapedData[action.details.as]?.length} items`);
              break;

            case 'wait':
              await new Promise(r => setTimeout(r, action.details.ms));
              results.push(`⏱️ Waited ${action.details.ms}ms`);
              break;
          }
        } catch (error) {
          results.push(`❌ Failed ${action.type}: ${error.message}`);
        }
      }
    }

    // Get page content for summary if needed
    let summary = '';
    const content = await page.content();
    
    if (content.length > 0) {
      const summaryResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "system",
          content: "Summarize this in 3 bullet points"
        }, {
          role: "user",
          content: content.substring(0, 15000)
        }]
      });
      summary = summaryResponse.choices[0].message.content;
    }

    await page.close();
    await context.close();

    return Response.json({
      success: true,
      results,
      scrapedData,
      summary,
      executionTime: Date.now() - startTime
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      results: [`❌ System Error: ${error.message}`],
      executionTime: Date.now() - startTime
    }, { status: 500 });
  }
}