/**
 * Bot Configuration
 */
require('dotenv').config();

module.exports = {
  // Telegram
  token: process.env.TELEGRAM_BOT_TOKEN,
  ownerId: process.env.OWNER_ID,

  // Bot Info
  botName: process.env.BOT_NAME || 'HackingAI',
  prefix: process.env.PREFIX || '/',

  // AI / Gemini
  geminiApiKey: process.env.GEMINI_API_KEY,
  aiModel: process.env.AI_MODEL || 'gemini-1.5-flash',

  // Knowledge Base
  maxContextChunks: parseInt(process.env.MAX_CONTEXT_CHUNKS) || 5,
  chunkSize: parseInt(process.env.CHUNK_SIZE) || 1500,
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP) || 200,

  // Paths
  pdfsDir: './pdfs',
  knowledgeFile: './data/knowledge.json',
  statsFile: './data/stats.json',
  usersFile: './data/users.json',

  // Features
  autoRead: process.env.AUTO_READ === 'true',

  // Force Join Channels/Groups
  forceJoin: true,
  requiredChannels: [
    { username: '@lonerterritorybackagain', name: '🔴 Channel 1', url: 'https://t.me/lonerterritorybackagain' },
    { username: '@Tarrificcrasher', name: '🔴 Channel 2', url: 'https://t.me/Tarrificcrasher' }
  ],
  requiredGroups: [
    { username: '@lonerisback', name: '🔵 Group', url: 'https://t.me/lonerisback' }
  ],

  // Messages
  messages: {
    ownerOnly: '⛔ This command is restricted to the bot owner.',
    error: '❌ An error occurred while processing your request.',
    noResults: '🔍 No relevant information found in the knowledge base.',
    thinking: '🧠 Thinking...',
    loading: '📚 Loading knowledge base...',
    notSubscribed: '🚫 You must join all channels and groups to use this bot!'
  }
};
