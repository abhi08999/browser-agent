import { OpenAI } from 'openai';
import { chromium } from 'playwright';

let _browser = null;

async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({ 
      headless: false,
      timeout: 30000
    });
  }
  return _browser;
}

export async function POST(request) {
  const startTime = Date.now(); // Properly define startTime here
  const { prompt } = await request.json();
  const openai = new OpenAI(process.env.OPENAI_API_KEY);
  
  try {
    const [aiResponse, browser] = await Promise.all([
      openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [{
          role: "system",
          content: `You are a browser automation assistant. Respond with JSON: {
            "actions": [{
              "type": "navigation|click|fill|scrape|wait",
              "details": {...}
            }],
            "summarize": boolean
          }`
        }, { role: "user", content: prompt }],
        response_format: { type: "json_object" }
      }),
      getBrowser()
    ]);

    const context = await browser.newContext();
    const page = await context.newPage();
    const results = [];
    const scrapedData = {};

    const { actions = [], summarize = false } = JSON.parse(aiResponse.choices[0].message.content);

    // Execute each action
    for (const action of actions) {
      const actionStart = Date.now();
      try {
        switch (action.type) {
          case 'navigation':
            await page.goto(action.details.url, { 
              waitUntil: 'domcontentloaded',
              timeout: 15000
            });
            results.push(`🌐 Navigated to ${action.details.url} (${Date.now() - actionStart}ms)`);
            break;

          case 'click':
            await page.click(action.details.selector);
            results.push(`🖱️ Clicked ${action.details.selector} (${Date.now() - actionStart}ms)`);
            break;

          case 'fill':
            await page.fill(action.details.selector, action.details.value);
            results.push(`📝 Filled ${action.details.selector} (${Date.now() - actionStart}ms)`);
            break;

          case 'scrape':
            scrapedData[action.details.as] = await page.$$eval(
              action.details.selector, 
              els => els.map(el => el.textContent?.trim())
            );
            results.push(`🧹 Scraped ${scrapedData[action.details.as]?.length} items from ${action.details.selector}`);
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

    // Handle summarization
    let summary = '';
    if (summarize) {
      const content = await page.content();
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
      results: [`❌ System Error: ${error.message}`]
    }, { status: 500 });
  }
}