/**
 * AI Engine - Google Gemini Integration
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

class AIEngine {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.initialized = false;
    this.init();
  }

  init() {
    try {
      if (!config.geminiApiKey) {
        console.log('⚠️ GEMINI_API_KEY not set. AI features will be disabled.');
        return;
      }

      this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
      this.model = this.genAI.getGenerativeModel({ 
        model: config.aiModel,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      });

      this.initialized = true;
      console.log('🤖 Gemini AI Engine initialized');
    } catch (error) {
      console.error('❌ Failed to initialize AI:', error.message);
    }
  }

  /**
   * Generate response with context from knowledge base
   */
  async generateResponse(query, context = '') {
    if (!this.initialized) {
      return {
        text: '❌ AI Engine not initialized. Please set GEMINI_API_KEY in your .env file.',
        sources: []
      };
    }

    const systemPrompt = `You are ${config.botName}, an expert AI assistant specializing in hacking, cybersecurity, networking, coding, and IT.
You have access to a knowledge base of PDF books and documents.

Rules:
1. Answer based on the provided context from the knowledge base
2. If the context doesn't contain the answer, say so clearly but offer general knowledge
3. Be technical and detailed - users want deep knowledge
4. Use code blocks, bullet points, and formatting for readability
5. Always cite your sources when using knowledge base information
6. For hacking topics, focus on educational/ethical hacking concepts
7. If asked about illegal activities, redirect to ethical cybersecurity education

Current query: ${query}`;

    const fullPrompt = context 
      ? `${systemPrompt}\n\n${context}\n\nBased on the above context and your knowledge, answer this question: ${query}`
      : `${systemPrompt}\n\nAnswer this question: ${query}`;

    try {
      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      return { text, sources: [] };
    } catch (error) {
      console.error('❌ AI Generation Error:', error.message);
      return {
        text: `❌ Error generating response: ${error.message}`,
        sources: []
      };
    }
  }

  /**
   * Simple chat without knowledge base
   */
  async chat(message, history = []) {
    if (!this.initialized) {
      return '❌ AI not initialized. Set GEMINI_API_KEY first.';
    }

    try {
      const chat = this.model.startChat({
        history: history.map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }]
        })),
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 2048,
        }
      });

      const result = await chat.sendMessage(message);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('❌ Chat Error:', error.message);
      return `❌ Error: ${error.message}`;
    }
  }

  /**
   * Check if AI is ready
   */
  isReady() {
    return this.initialized;
  }
}

module.exports = AIEngine;
