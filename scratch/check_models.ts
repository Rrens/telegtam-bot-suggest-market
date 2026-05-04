import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY not found in .env file');
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    // Note: The SDK might not have a direct listModels, we use the fetch approach if needed
    // but the standard way to check is via the Google AI Studio or this API call:
    console.log('Fetching available models for your API key...');
    
    // Using the models property which might exist in newer SDKs or direct fetch
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json() as any;
    
    if (data && data.models) {
      console.log('\nAvailable Models:');
      data.models.forEach((m: any) => {
        console.log(`- ${m.name.replace('models/', '')} (${m.displayName})`);
        console.log(`  Methods: ${m.supportedGenerationMethods.join(', ')}`);
      });
    } else {
      console.log('No models found or error in response:', data);
    }
  } catch (err) {
    console.error('Failed to list models:', err);
  }
}

listModels();
