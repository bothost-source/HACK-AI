/**
 * Hacking AI Bot - Main Entry Point
 * Powered by Google Gemini + PDF Knowledge Base
 * Features: Force Join, Keyboard Buttons, Colored UI
 */

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const PDFProcessor = require('./pdfProcessor');
const KnowledgeBase = require('./knowledgeBase');
const AIEngine = require('./aiEngine');
const StatsManager = require('./stats');

// Check required config
if (!config.token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required!');
  console.error('   Set it in your .env file or environment variables.');
  process.exit(1);
}

// Initialize components
const bot = new TelegramBot(config.token, { polling: true });
const pdfProcessor = new PDFProcessor();
const kb = new KnowledgeBase();
const ai = new AIEngine();
const stats = new StatsManager();

// Track users who passed force join check
const verifiedUsers = new Set();

// Load knowledge base on startup
console.log('\n🚀 Starting ' + config.botName + '...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const kbLoaded = kb.load();
if (!kbLoaded) {
  console.log('\n⚠️ No knowledge base found.');
  console.log('   Upload PDFs to the pdfs/ folder and use /reload');
}

console.log('\n✅ Bot is ready!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ============== FORCE JOIN CHECK ==============

async function checkUserMembership(userId) {
  if (!config.forceJoin) return true;
  if (verifiedUsers.has(userId)) return true;
  if (userId.toString() === config.ownerId) return true;

  const allChannels = [...config.requiredChannels, ...config.requiredGroups];

  for (const channel of allChannels) {
    try {
      const member = await bot.getChatMember(channel.username, userId);
      if (member.status === 'left' || member.status === 'kicked') {
        return false;
      }
    } catch (error) {
      console.log(`⚠️ Cannot check ${channel.username}:`, error.message);
      return false;
    }
  }

  verifiedUsers.add(userId);
  return true;
}

function getForceJoinKeyboard() {
  const buttons = [];

  config.requiredChannels.forEach(ch => {
    buttons.push([{ text: ch.name, url: ch.url }]);
  });

  config.requiredGroups.forEach(gr => {
    buttons.push([{ text: gr.name, url: gr.url }]);
  });

  buttons.push([{ text: '✅ I have joined all', callback_data: 'verify_join' }]);

  return { inline_keyboard: buttons };
}

function getForceJoinText(firstName) {
  let text = `
╔══════════════════════════════════╗
║     🚫 ACCESS DENIED     ║
╚══════════════════════════════════╝

👋 Hey <b>${firstName}</b>!

🎯 To use this bot, you must join all channels and groups below:

📢 <b>Required Channels:</b>
`;

  config.requiredChannels.forEach((ch, i) => {
    text += `   ${i + 1}. ${ch.name}\n`;
  });

  text += `\n👥 <b>Required Groups:</b>\n`;

  config.requiredGroups.forEach((gr, i) => {
    text += `   ${i + 1}. ${gr.name}\n`;
  });

  text += `
⚡ <b>Steps:</b>
   1️⃣ Click each button below
   2️⃣ Join the channel/group
   3️⃣ Click "✅ I have joined all"

💡 <i>After joining, you can use all bot features!</i>
  `;

  return text;
}

// ============== MAIN KEYBOARD ==============

function getMainKeyboard() {
  return {
    keyboard: [
      ['🔍 Ask Question', '📚 Search KB'],
      ['🔓 Hacking Info', '🤖 Chat with AI'],
      ['📊 Status', '📖 Help'],
      ['ℹ️ About', '🏓 Ping']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function getOwnerKeyboard() {
  return {
    keyboard: [
      ['🔍 Ask Question', '📚 Search KB'],
      ['🔓 Hacking Info', '🤖 Chat with AI'],
      ['📊 Status', '📖 Help'],
      ['ℹ️ About', '🏓 Ping'],
      ['👑 Owner Panel']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

// ============== COLOR FORMATTING (Telegram-safe) ==============
// Telegram HTML only supports: <b>, <i>, <u>, <s>, <code>, <pre>, <a>, <tg-spoiler>
// NO style attributes allowed. We use emoji indicators instead.

const colors = {
  red: (text) => `🔴 <b>${text}</b>`,
  green: (text) => `🟢 <b>${text}</b>`,
  blue: (text) => `🔵 <b>${text}</b>`,
  yellow: (text) => `🟡 <b>${text}</b>`,
  purple: (text) => `🟣 <b>${text}</b>`,
  orange: (text) => `🟠 <b>${text}</b>`,
  cyan: (text) => `🔷 <b>${text}</b>`
};

// ============== COMMAND HANDLERS ==============

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || 'User';

  stats.trackUser(userId, msg.from.username, firstName);
  stats.trackCommand('start');

  // Check force join
  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(firstName), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  const welcomeText = `
╔══════════════════════════════════╗
║     🔵 <b>${config.botName.toUpperCase()}</b>     ║
╚══════════════════════════════════╝

👋 Hello, <b>${firstName}</b>!

🟢 <b>You now have full access!</b>

📚 <b>What I can do:</b>
🟡 • Answer technical questions
🟡 • Explain hacking concepts  
🟡 • Search my knowledge base
🟡 • Help with coding & networking

🟠 <b>Quick Commands:</b>
Use the keyboard below or type:
<code>/ask What is SQL injection?</code>
<code>/hack WiFi security</code>
<code>/search buffer overflow</code>

💡 <i>Upload PDFs and use /reload to teach me new things!</i>
  `;

  const keyboard = userId.toString() === config.ownerId ? getOwnerKeyboard() : getMainKeyboard();

  bot.sendMessage(chatId, welcomeText, { 
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
});

// /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(msg.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  stats.trackCommand('help');

  const helpText = `
╔══════════════════════════════════╗
║     🟡 <b>COMMAND LIST</b>     ║
╚══════════════════════════════════╝

🔴 <b>🔍 Query Commands:</b>
<code>/ask &lt;question&gt;</code> - Ask AI with knowledge base
<code>/search &lt;query&gt;</code> - Search PDF knowledge base
<code>/hack &lt;topic&gt;</code> - Get hacking/cybersec info
<code>/chat &lt;message&gt;</code> - Free chat with AI

🔵 <b>📚 Knowledge Base:</b>
<code>/reload</code> - Reload all PDFs (owner only)
<code>/status</code> - Knowledge base status
<code>/sources</code> - List loaded PDF sources

🟢 <b>📊 Bot Info:</b>
<code>/stats</code> - Bot usage statistics
<code>/about</code> - About this bot
<code>/ping</code> - Check bot latency

🟣 <b>👑 Owner Commands:</b>
<code>/broadcast &lt;msg&gt;</code> - Send message to all users
<code>/users</code> - List all users

🟠 <b>💡 Example:</b>
<code>/ask What is SQL injection?</code>
<code>/hack How to secure a WiFi network?</code>
  `;

  bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
});

// /ask - Ask with knowledge base
bot.onText(/\/ask (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const query = match[1].trim();

  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(msg.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  stats.trackUser(userId, msg.from.username, msg.from.first_name);
  stats.trackCommand('ask');

  const thinkingMsg = await bot.sendMessage(chatId, '🧠 <b>Thinking...</b>', { parse_mode: 'HTML' });

  try {
    const { context, sources, found } = kb.getContext(query);
    const response = await ai.generateResponse(query, context);

    let replyText = response.text;

    if (found && sources.length > 0) {
      replyText += `\n\n📚 <b>Sources:</b> ${sources.join(', ')}`;
    }

    await bot.deleteMessage(chatId, thinkingMsg.message_id);

    // FIX: Use HTML instead of Markdown to avoid parse errors from AI output
    if (replyText.length > 4000) {
      const chunks = replyText.match(/[\s\S]{1,4000}/g) || [replyText];
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
      }
    } else {
      await bot.sendMessage(chatId, replyText, { parse_mode: 'HTML' });
    }

  } catch (error) {
    await bot.deleteMessage(chatId, thinkingMsg.message_id);
    bot.sendMessage(chatId, `❌ <b>Error:</b> ${error.message}`, { parse_mode: 'HTML' });
  }
});

// /search - Search knowledge base only
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const query = match[1].trim();

  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(msg.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  stats.trackCommand('search');

  const { chunks, sources } = kb.search(query);

  if (chunks.length === 0) {
    return bot.sendMessage(chatId, '🔍 <b>No results found.</b>', { parse_mode: 'HTML' });
  }

  let response = `🔍 <b>Search Results for:</b> <i>${query}</i>\n\n`;

  chunks.forEach((chunk, i) => {
    response += `<b>Result ${i + 1}</b> 🟠 (from ${chunk.source})\n`;
    response += `<code>${chunk.text.substring(0, 500)}...</code>\n\n`;
  });

  response += `📚 <b>Sources:</b> ${sources.join(', ')}`;

  bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
});

// /hack - Quick hacking info
bot.onText(/\/hack (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const topic = match[1].trim();

  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(msg.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  stats.trackCommand('hack');

  const thinkingMsg = await bot.sendMessage(chatId, '🔓 <b>Loading hacking knowledge...</b>', { parse_mode: 'HTML' });

  try {
    const query = `Explain ${topic} in cybersecurity/hacking context. Include practical examples, tools, and prevention methods.`;
    const { context, sources, found } = kb.getContext(topic);
    const response = await ai.generateResponse(query, context);

    await bot.deleteMessage(chatId, thinkingMsg.message_id);

    let replyText = `🔓 <b>Hacking Topic:</b> 🔴 ${topic}\n\n${response.text}`;
    if (found && sources.length > 0) {
      replyText += `\n\n📚 <b>Sources:</b> ${sources.join(', ')}`;
    }

    bot.sendMessage(chatId, replyText, { parse_mode: 'HTML' });
  } catch (error) {
    await bot.deleteMessage(chatId, thinkingMsg.message_id);
    bot.sendMessage(chatId, `❌ <b>Error:</b> ${error.message}`, { parse_mode: 'HTML' });
  }
});

// /chat - Free chat with AI
bot.onText(/\/chat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const message = match[1].trim();

  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(msg.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  stats.trackCommand('chat');

  const thinkingMsg = await bot.sendMessage(chatId, '🤖 <b>Typing...</b>', { parse_mode: 'HTML' });

  try {
    const response = await ai.chat(message);
    await bot.deleteMessage(chatId, thinkingMsg.message_id);
    // FIX: Use HTML to avoid Markdown parse errors
    bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
  } catch (error) {
    await bot.deleteMessage(chatId, thinkingMsg.message_id);
    bot.sendMessage(chatId, `❌ <b>Error:</b> ${error.message}`, { parse_mode: 'HTML' });
  }
});

// /reload - Reload PDFs (owner only)
bot.onText(/\/reload/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId.toString() !== config.ownerId) {
    return bot.sendMessage(chatId, '⛔ <b>This command is restricted to the bot owner.</b>', { parse_mode: 'HTML' });
  }

  stats.trackCommand('reload');
  const loadingMsg = await bot.sendMessage(chatId, '📚 <b>Reloading knowledge base...</b>', { parse_mode: 'HTML' });

  try {
    const result = await pdfProcessor.processAllPDFs();
    kb.load();

    await bot.deleteMessage(chatId, loadingMsg.message_id);
    bot.sendMessage(chatId, 
      `✅ <b>Knowledge Base Reloaded!</b>\n\n📄 Files: 🔵 <b>${result.totalFiles}</b>\n🧩 Chunks: 🟢 <b>${result.totalChunks}</b>\n📁 Files: ${result.files.join(', ')}`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    await bot.deleteMessage(chatId, loadingMsg.message_id);
    bot.sendMessage(chatId, `❌ <b>Error reloading:</b> ${error.message}`, { parse_mode: 'HTML' });
  }
});

// /status - KB status
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(msg.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  stats.trackCommand('status');

  const kbStats = kb.getStats();
  const aiReady = ai.isReady();

  const statusText = `
╔══════════════════════════════════╗
║     🔵 <b>BOT STATUS</b>     ║
╚══════════════════════════════════╝

🤖 <b>AI Engine:</b> ${aiReady ? '🟢 ✅ Ready' : '🔴 ❌ Not Ready'}
📚 <b>Knowledge Base:</b> ${kbStats.loaded ? '🟢 ✅ Loaded' : '🔴 ❌ Not Loaded'}
📄 <b>PDF Files:</b> 🟡 <b>${kbStats.totalFiles}</b>
🧩 <b>Total Chunks:</b> 🟡 <b>${kbStats.totalChunks}</b>
👥 <b>Total Users:</b> 🟣 <b>${stats.stats.totalUsers}</b>
💬 <b>Total Queries:</b> 🟣 <b>${stats.stats.totalQueries}</b>
⏱ <b>Uptime:</b> 🔷 <b>${stats.getStats().uptime}</b>
  `;

  bot.sendMessage(chatId, statusText, { parse_mode: 'HTML' });
});

// /sources - List loaded sources
bot.onText(/\/sources/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(msg.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  stats.trackCommand('sources');

  const kbStats = kb.getStats();

  if (!kbStats.loaded || kbStats.files.length === 0) {
    return bot.sendMessage(chatId, '❌ <b>No PDF sources loaded.</b> Use /reload to load PDFs.', { parse_mode: 'HTML' });
  }

  let text = '📚 <b>Loaded PDF Sources:</b>\n\n';
  kbStats.files.forEach((file, i) => {
    text += `🟡 ${i + 1}. 📄 ${file}\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
});

// /stats - Usage stats
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(msg.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  stats.trackCommand('stats');

  const s = stats.getStats();

  let text = `
╔══════════════════════════════════╗
║     🟡 <b>BOT STATISTICS</b>     ║
╚══════════════════════════════════╝

👥 <b>Total Users:</b> 🔵 <b>${s.totalUsers}</b>
💬 <b>Total Messages:</b> 🔵 <b>${s.totalMessages}</b>
🔍 <b>Total Queries:</b> 🔵 <b>${s.totalQueries}</b>
⏱ <b>Uptime:</b> 🔷 <b>${s.uptime}</b>

🟠 <b>📊 Top Commands:</b>
  `;

  s.topCommands.forEach(([cmd, count]) => {
    text += `\n🟢 • ${cmd}: 🟡 <b>${count}</b> uses`;
  });

  bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
});

// /about
bot.onText(/\/about/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(msg.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  stats.trackCommand('about');

  const aboutText = `
╔══════════════════════════════════╗
║     🟣 <b>ℹ️ ABOUT</b>     ║
╚══════════════════════════════════╝

🤖 <b>${config.botName}</b>
An AI-powered Telegram bot for hacking & cybersecurity knowledge.

🔵 <b>Powered by:</b>
🟡 • Google Gemini AI
🟡 • Custom PDF Knowledge Base
🟡 • Node.js + Telegram Bot API

🟢 <b>Features:</b>
🟡 • PDF-based knowledge retrieval
🟡 • Smart context-aware answers
🟡 • Multi-topic hacking expertise
🟡 • Continuous learning from uploads

👨‍💻 <b>Developer:</b> @TARRIFIC
  `;

  bot.sendMessage(chatId, aboutText, { parse_mode: 'HTML' });
});

// /ping
bot.onText(/\/ping/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(msg.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  const start = Date.now();

  const sent = await bot.sendMessage(chatId, '🏓 <b>Pinging...</b>', { parse_mode: 'HTML' });
  const end = Date.now();

  bot.editMessageText(`🏓 <b>Pong!</b>\n\n⚡ <b>Latency:</b> 🟢 <b>${end - start}ms</b>`, {
    chat_id: chatId,
    message_id: sent.message_id,
    parse_mode: 'HTML'
  });
});

// ============== KEYBOARD BUTTON HANDLERS ==============

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // Check force join for all keyboard actions
  const isMember = await checkUserMembership(userId);
  if (!isMember) {
    return bot.sendMessage(chatId, getForceJoinText(msg.from.first_name), {
      parse_mode: 'HTML',
      reply_markup: getForceJoinKeyboard()
    });
  }

  stats.trackUser(userId, msg.from.username, msg.from.first_name);

  switch(text) {
    case '🔍 Ask Question': {
      bot.sendMessage(chatId, 
        '🔵 <b>🔍 Ask a Question</b>\n\nType your question like this:\n<code>/ask What is SQL injection?</code>',
        { parse_mode: 'HTML' }
      );
      break;
    }

    case '📚 Search KB': {
      bot.sendMessage(chatId,
        '🟢 <b>📚 Search Knowledge Base</b>\n\nType your search like this:\n<code>/search buffer overflow</code>',
        { parse_mode: 'HTML' }
      );
      break;
    }

    case '🔓 Hacking Info': {
      bot.sendMessage(chatId,
        '🔴 <b>🔓 Get Hacking Info</b>\n\nType a topic like this:\n<code>/hack WiFi security</code>\n<code>/hack Metasploit basics</code>',
        { parse_mode: 'HTML' }
      );
      break;
    }

    case '🤖 Chat with AI': {
      bot.sendMessage(chatId,
        '🟣 <b>🤖 Chat with AI</b>\n\nStart a conversation:\n<code>/chat Explain DNS spoofing</code>',
        { parse_mode: 'HTML' }
      );
      break;
    }

    case '📊 Status': {
      const kbStats = kb.getStats();
      const aiReady = ai.isReady();
      const statusText = `
╔══════════════════════════════════╗
║     🔵 <b>BOT STATUS</b>     ║
╚══════════════════════════════════╝

🤖 <b>AI Engine:</b> ${aiReady ? '🟢 ✅ Ready' : '🔴 ❌ Not Ready'}
📚 <b>Knowledge Base:</b> ${kbStats.loaded ? '🟢 ✅ Loaded' : '🔴 ❌ Not Loaded'}
📄 <b>PDF Files:</b> 🟡 <b>${kbStats.totalFiles}</b>
🧩 <b>Total Chunks:</b> 🟡 <b>${kbStats.totalChunks}</b>
👥 <b>Total Users:</b> 🟣 <b>${stats.stats.totalUsers}</b>
💬 <b>Total Queries:</b> 🟣 <b>${stats.stats.totalQueries}</b>
⏱ <b>Uptime:</b> 🔷 <b>${stats.getStats().uptime}</b>
      `;
      bot.sendMessage(chatId, statusText, { parse_mode: 'HTML' });
      break;
    }

    case '📖 Help': {
      const helpText = `
╔══════════════════════════════════╗
║     🟡 <b>COMMAND LIST</b>     ║
╚══════════════════════════════════╝

🔴 <b>🔍 Query Commands:</b>
<code>/ask &lt;question&gt;</code> - Ask AI with knowledge base
<code>/search &lt;query&gt;</code> - Search PDF knowledge base
<code>/hack &lt;topic&gt;</code> - Get hacking/cybersec info
<code>/chat &lt;message&gt;</code> - Free chat with AI

🔵 <b>📚 Knowledge Base:</b>
<code>/reload</code> - Reload all PDFs (owner only)
<code>/status</code> - Knowledge base status
<code>/sources</code> - List loaded PDF sources

🟢 <b>📊 Bot Info:</b>
<code>/stats</code> - Bot usage statistics
<code>/about</code> - About this bot
<code>/ping</code> - Check bot latency

🟣 <b>👑 Owner Commands:</b>
<code>/broadcast &lt;msg&gt;</code> - Send message to all users
<code>/users</code> - List all users
      `;
      bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
      break;
    }

    case 'ℹ️ About': {
      const aboutText = `
╔══════════════════════════════════╗
║     🟣 <b>ℹ️ ABOUT</b>     ║
╚══════════════════════════════════╝

🤖 <b>${config.botName}</b>
An AI-powered Telegram bot for hacking & cybersecurity knowledge.

🔵 <b>Powered by:</b>
🟡 • Google Gemini AI
🟡 • Custom PDF Knowledge Base
🟡 • Node.js + Telegram Bot API

🟢 <b>Features:</b>
🟡 • PDF-based knowledge retrieval
🟡 • Smart context-aware answers
🟡 • Multi-topic hacking expertise
🟡 • Continuous learning from uploads

👨‍💻 <b>Developer:</b> @TARRIFIC
      `;
      bot.sendMessage(chatId, aboutText, { parse_mode: 'HTML' });
      break;
    }

    case '🏓 Ping': {
      const start = Date.now();
      const sent = await bot.sendMessage(chatId, '🏓 <b>Pinging...</b>', { parse_mode: 'HTML' });
      const end = Date.now();
      bot.editMessageText(`🏓 <b>Pong!</b>\n\n⚡ <b>Latency:</b> 🟢 <b>${end - start}ms</b>`, {
        chat_id: chatId,
        message_id: sent.message_id,
        parse_mode: 'HTML'
      });
      break;
    }

    case '👑 Owner Panel': {
      if (userId.toString() !== config.ownerId) {
        return bot.sendMessage(chatId, '⛔ <b>Unauthorized access.</b>', { parse_mode: 'HTML' });
      }

      const ownerText = `
╔══════════════════════════════════╗
║     🟡 <b>👑 OWNER PANEL</b>     ║
╚══════════════════════════════════╝

🔴 <b>Owner Commands:</b>

<code>/reload</code>
🟢 → Reload all PDFs into knowledge base

<code>/broadcast &lt;message&gt;</code>
🟢 → Send message to all users

<code>/users</code>
🟢 → List all registered users

<code>/stats</code>
🟢 → View bot statistics

💡 <i>Use these commands to manage your bot!</i>
      `;
      bot.sendMessage(chatId, ownerText, { parse_mode: 'HTML' });
      break;
    }
  }
});

// ============== CALLBACK HANDLERS ==============

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data === 'verify_join') {
    const allChannels = [...config.requiredChannels, ...config.requiredGroups];
    let allJoined = true;
    let notJoined = [];

    for (const channel of allChannels) {
      try {
        const member = await bot.getChatMember(channel.username, userId);
        if (member.status === 'left' || member.status === 'kicked') {
          allJoined = false;
          notJoined.push(channel.name);
        }
      } catch (error) {
        allJoined = false;
        notJoined.push(channel.name);
      }
    }

    if (allJoined) {
      verifiedUsers.add(userId);
      bot.answerCallbackQuery(query.id, { text: '✅ Verified! You can now use the bot.' });

      const keyboard = userId.toString() === config.ownerId ? getOwnerKeyboard() : getMainKeyboard();

      bot.sendMessage(chatId, `
✅ <b>Verification Successful!</b>

🟢 <b>🎉 Welcome! You now have full access to the bot.</b>

Use the keyboard below or type /help for commands.
      `, { parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      bot.answerCallbackQuery(query.id, { 
        text: '❌ You have not joined all channels/groups yet!',
        show_alert: true 
      });
    }
  }
});

// ============== OWNER COMMANDS ==============

// /broadcast (owner only)
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const message = match[1];

  if (userId.toString() !== config.ownerId) {
    return bot.sendMessage(chatId, '⛔ <b>This command is restricted to the bot owner.</b>', { parse_mode: 'HTML' });
  }

  const allUsers = Object.keys(stats.stats.users);
  let success = 0;
  let failed = 0;

  for (const uid of allUsers) {
    try {
      await bot.sendMessage(uid, `📢 <b>Broadcast:</b>\n\n${message}`, { parse_mode: 'HTML' });
      success++;
    } catch (e) {
      failed++;
    }
  }

  bot.sendMessage(chatId, `📢 <b>Broadcast Complete</b>\n✅ Sent: 🟢 <b>${success}</b>\n❌ Failed: 🔴 <b>${failed}</b>`, { parse_mode: 'HTML' });
});

// /users (owner only)
bot.onText(/\/users/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId.toString() !== config.ownerId) {
    return bot.sendMessage(chatId, '⛔ <b>This command is restricted to the bot owner.</b>', { parse_mode: 'HTML' });
  }

  const users = stats.stats.users;
  const userList = Object.entries(users).map(([id, data]) => {
    return `🆔 ${id} | @${data.username || 'N/A'} | ${data.firstName} | Msgs: ${data.messageCount}`;
  }).join('\n');

  bot.sendMessage(chatId, `👥 <b>Users (${Object.keys(users).length}):</b>\n\n${userList}`, { parse_mode: 'HTML' });
});

// ============== ERROR HANDLING ==============

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

bot.on('error', (error) => {
  console.error('Bot error:', error.message);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
});

console.log('\n🤖 Bot is running and listening for messages...\n');
