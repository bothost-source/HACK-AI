/**
 * Hacking AI Bot - Main Entry Point
 * Powered by Google Gemini + PDF Knowledge Base
 * Features: Force Join, Keyboard Buttons, Colored UI, Interactive Teaching
 */

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const PDFProcessor = require('./pdfProcessor');
const KnowledgeBase = require('./knowledgeBase');
const AIEngine = require('./aiEngine');
const StatsManager = require('./stats');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

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

// Conversation memory for /ask
const userConversations = new Map();

// ============ HELPER: Download file using https (reliable) ============
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// ============ PDF UPLOAD HANDLER (COMPLETELY REWRITTEN) ============
bot.on('document', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'unknown';

    console.log(`📄 Document received from ${userId} (@${username}): ${msg.document.file_name}`);

    // 1. OWNER ONLY CHECK
    if (userId.toString() !== config.ownerId) {
      console.log(`⛔ Rejected PDF upload from non-owner: ${userId} (@${username})`);
      return bot.sendMessage(chatId, '❌ Only the bot owner can upload PDFs.\n\n👑 Owner: @TARRIFIC');
    }

    const fileName = msg.document.file_name;
    const fileSize = msg.document.file_size;

    // 2. PDF EXTENSION CHECK
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return bot.sendMessage(chatId, '❌ Only PDF files (.pdf) are allowed.');
    }

    // 3. FILE SIZE LIMIT (50 MB max)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (fileSize > MAX_SIZE) {
      return bot.sendMessage(chatId, `❌ File too large!\n\n📊 Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n📏 Max allowed: 50 MB`);
    }

    // 4. DUPLICATE DETECTION
    const filePath = path.join(config.pdfsDir, fileName);
    
    if (fs.existsSync(filePath)) {
      const existingSize = fs.statSync(filePath).size;
      
      if (existingSize === fileSize) {
        return bot.sendMessage(chatId, `⚠️ PDF "${fileName}" already exists with same size.\n\nUse /reload if you want to refresh the knowledge base.`);
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newName = `${path.parse(fileName).name}_${timestamp}.pdf`;
      const newPath = path.join(config.pdfsDir, newName);
      
      await downloadAndSave(msg.document, newPath, chatId, newName, true);
      return;
    }

    // 5. DOWNLOAD AND SAVE
    await downloadAndSave(msg.document, filePath, chatId, fileName, false);

  } catch (error) {
    console.error('❌ CRITICAL ERROR in document handler:', error);
    try {
      await bot.sendMessage(msg.chat.id, `❌ Upload failed: ${error.message}`);
    } catch (e) {
      console.error('Failed to send error message:', e.message);
    }
  }
});

// Helper function to download and save PDF
async function downloadAndSave(document, filePath, chatId, displayName, isRenamed) {
  try {
    const statusMsg = await bot.sendMessage(chatId, `⏳ Downloading "${displayName}"...`);

    const fileLink = await bot.getFileLink(document.file_id);
    console.log(`🔗 File link obtained: ${fileLink}`);

    if (!fs.existsSync(config.pdfsDir)) {
      fs.mkdirSync(config.pdfsDir, { recursive: true });
      console.log(`📁 Created directory: ${config.pdfsDir}`);
    }

    console.log(`⬇️ Downloading to: ${filePath}`);
    await downloadFile(fileLink, filePath);
    console.log(`✅ Download complete: ${filePath}`);

    const buffer = fs.readFileSync(filePath);
    
    const header = buffer.slice(0, 5).toString();
    if (header !== '%PDF-') {
      fs.unlinkSync(filePath);
      throw new Error('File is not a valid PDF (invalid header)');
    }

    const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);

    let reloadStatus = '';
    try {
      const loaded = await kb.load();
      reloadStatus = loaded 
        ? '\n\n🔄 Knowledge base auto-reloaded successfully!' 
        : '\n\n⚠️ Knowledge base reload failed. Use /reload manually.';
    } catch (reloadError) {
      reloadStatus = '\n\n⚠️ Auto-reload error. Use /reload manually.';
      console.error('Auto-reload error:', reloadError.message);
    }

    const fileSizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
    const renameNote = isRenamed ? '\n\n📝 Note: File was renamed to avoid conflict.' : '';
    
    await bot.editMessageText(
      `✅ PDF uploaded successfully!\n\n` +
      `📄 Name: ${displayName}\n` +
      `📊 Size: ${fileSizeMB} MB\n` +
      `🔐 Hash: ${hash}\n` +
      `📁 Saved to: pdfs/\n` +
      `👤 By: Owner` +
      reloadStatus +
      renameNote,
      { chat_id: chatId, message_id: statusMsg.message_id }
    );

    console.log(`📥 PDF uploaded: ${displayName} (${fileSizeMB} MB) by owner`);

  } catch (error) {
    console.error('PDF upload error:', error);
    bot.sendMessage(chatId, `❌ Failed to upload PDF:\n\n${error.message}\n\nPlease try again.`);
  }
}

// ============ IMAGE GENERATION HELPER ============
function wantsImages(text) {
  const imageKeywords = [
    'with images', 'with image', 'show me', 'show image', 'show images',
    'generate image', 'create image', 'draw', 'picture of', 'photo of',
    'visual', 'diagram', 'illustration', 'infographic', 'chart'
  ];
  const lowerText = text.toLowerCase();
  return imageKeywords.some(keyword => lowerText.includes(keyword));
}

function extractImagePrompts(topic, text, maxImages = 3) {
  const basePrompt = `${topic}, detailed, high quality, professional, realistic`;
  const lines = text.split('\n').filter(line => line.trim().length > 10);
  const prompts = [];
  for (let i = 0; i < Math.min(lines.length, maxImages); i++) {
    if (lines[i].includes(':') || lines[i].includes('-') || lines[i].includes('•')) {
      const cleanLine = lines[i].replace(/[^\w\s]/g, '').trim().substring(0, 100);
      if (cleanLine.length > 5) prompts.push(`${cleanLine}, ${basePrompt}`);
    }
  }
  if (prompts.length === 0) {
    prompts.push(`${topic}, detailed infographic, professional design`);
    prompts.push(`${topic}, realistic photograph, high quality`);
  }
  return prompts.slice(0, maxImages);
}

function generateImage(prompt) {
  const encodedPrompt = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
}

async function sendResponseWithImages(chatId, text, topic, msgIdToEdit = null) {
  try {
    const shouldGenerateImages = wantsImages(text) || topic.toLowerCase().includes('image');
    if (!shouldGenerateImages) {
      if (msgIdToEdit) {
        await bot.editMessageText(text, { chat_id: chatId, message_id: msgIdToEdit, parse_mode: 'HTML' });
      } else {
        await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
      }
      return;
    }
    const statusMsg = msgIdToEdit 
      ? { message_id: msgIdToEdit, chat: { id: chatId } }
      : await bot.sendMessage(chatId, '🎨 Generating response with images...');
    const imagePrompts = extractImagePrompts(topic, text, 3);
    const imageUrls = [];
    for (const prompt of imagePrompts) {
      imageUrls.push({ url: generateImage(prompt), prompt });
    }
    await bot.editMessageText(
      `${text}\n\n🎨 <b>Generating ${imageUrls.length} images...</b>`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
    );
    for (let i = 0; i < imageUrls.length; i++) {
      const { url } = imageUrls[i];
      try {
        await bot.sendPhoto(chatId, url, {
          caption: i === 0 ? `🎨 <b>Visual ${i + 1} of ${imageUrls.length}</b>\n📌 Related to: "${topic}"` : `🎨 <b>Visual ${i + 1} of ${imageUrls.length}</b>`,
          parse_mode: 'HTML'
        });
        if (i < imageUrls.length - 1) await new Promise(r => setTimeout(r, 1500));
      } catch (imgError) {
        console.error(`Failed to send image ${i + 1}:`, imgError.message);
      }
    }
  } catch (error) {
    console.error('Error in sendResponseWithImages:', error);
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  }
}

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
<code>/ask &lt;question&gt;</code> - Ask AI with knowledge base (interactive)
<code>/search &lt;query&gt;</code> - Search PDF knowledge base
<code>/hack &lt;topic&gt;</code> - Get interactive hacking guide
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
<code>/hack How to add security to your device</code>
  `;

  bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
});

// /ask - Conversational AI with memory (REWRITTEN)
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
    const history = userConversations.get(userId) || [];
    const { context, sources, found } = kb.getContext(query);
    
    const conversationPrompt = `
You are a cybersecurity mentor. Answer the user's question conversationally.

Previous conversation:
${history.slice(-3).map(h => `User: ${h.user}\nYou: ${h.bot}`).join('\n')}

${found ? `Relevant knowledge base context:\n${context}\n\n` : ''}

User's new question: "${query}"

Instructions:
- Answer directly and practically
- If explaining a process, give numbered steps
- Suggest tools or commands where relevant
- If the user seems confused, simplify
- Keep it conversational but informative
- If you don't know, say so honestly

Respond as if you're teaching a student 1-on-1.
`;

    const response = await ai.generateResponse(conversationPrompt, context || '');

    history.push({ user: query, bot: response.text.substring(0, 200) });
    if (history.length > 10) history.shift();
    userConversations.set(userId, history);

    let replyText = response.text;

    if (found && sources.length > 0) {
      replyText += `\n\n📚 <b>Sources:</b> ${sources.join(', ')}`;
    }

    await bot.deleteMessage(chatId, thinkingMsg.message_id);

    const helpKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ Helpful', callback_data: `helpful_${userId}` },
          { text: '❌ Not Helpful', callback_data: `nothelpful_${userId}` }
        ],
        [
          { text: '🔍 Explain More', callback_data: `explain_${query}` },
          { text: '🛠️ Show Example', callback_data: `example_${query}` }
        ]
      ]
    };

    if (replyText.length > 4000) {
      const chunks = replyText.match(/[\s\S]{1,4000}/g) || [replyText];
      for (let i = 0; i < chunks.length; i++) {
        if (i === chunks.length - 1) {
          await bot.sendMessage(chatId, chunks[i], { parse_mode: 'HTML', reply_markup: helpKeyboard });
        } else {
          await bot.sendMessage(chatId, chunks[i], { parse_mode: 'HTML' });
        }
      }
    } else {
      await bot.sendMessage(chatId, replyText, { parse_mode: 'HTML', reply_markup: helpKeyboard });
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

// /hack - Interactive hacking guide (REWRITTEN)
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

  const thinkingMsg = await bot.sendMessage(chatId, '🔓 <b>Analyzing topic & building your guide...</b>', { parse_mode: 'HTML' });

  try {
    const { context, sources, found } = kb.getContext(topic);
    
    const teachingPrompt = `
You are an expert cybersecurity mentor. The user wants to learn: "${topic}"

${found && context ? `Here is relevant knowledge from our database to base your answer on:\n${context}\n\n` : ''}

Your task:
1. **Understand** what the user wants to achieve
2. **Explain the concept** in simple terms (like explaining to a beginner)
3. **Provide a step-by-step actionable guide** they can follow RIGHT NOW
4. **Include specific commands, tools, or settings** where applicable
5. **Add safety warnings** about legal/ethical boundaries
6. **Suggest what to do next** after completing the steps

Format your response as:
🔹 CONCEPT: Brief explanation
🔹 TOOLS NEEDED: List what they need
🔹 STEP-BY-STEP GUIDE:
   Step 1: ...
   Step 2: ...
   Step 3: ...
🔹 SAFETY WARNINGS: What NOT to do
🔹 NEXT STEPS: Where to go from here

Do NOT just copy from the knowledge base. Use it as reference, but explain and guide like a mentor would.
`;

    const response = await ai.generateResponse(teachingPrompt, context || '');

    await bot.deleteMessage(chatId, thinkingMsg.message_id);

    let replyText = `🔓 <b>Hacking Guide: ${topic}</b>\n\n${response.text}`;
    
    if (found && sources.length > 0) {
      replyText += `\n\n📚 <b>Reference Sources:</b> ${sources.join(', ')}`;
    }

    await sendResponseWithImages(chatId, replyText, topic);

    const followUpKeyboard = {
      inline_keyboard: [
        [
          { text: '🔍 Deep Dive', callback_data: `deep_${topic}` },
          { text: '🛠️ Show Commands', callback_data: `commands_${topic}` }
        ],
        [
          { text: '⚠️ Common Mistakes', callback_data: `mistakes_${topic}` },
          { text: '📋 Checklist', callback_data: `checklist_${topic}` }
        ]
      ]
    };

    await bot.sendMessage(chatId, 
      `💡 <b>Want to go deeper?</b> Choose an option below or ask a follow-up question with <code>/ask</code>`, 
      { parse_mode: 'HTML', reply_markup: followUpKeyboard }
    );

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
    await sendResponseWithImages(chatId, response, message);
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
  if (msg.document) {
    console.log(`📄 Message handler skipping document: ${msg.document.file_name}`);
    return;
  }
  
  if (!msg.text) {
    console.log(`⚠️ Message handler skipping non-text message`);
    return;
  }
  
  if (msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

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
        '🔴 <b>🔓 Get Hacking Info</b>\n\nType a topic like this:\n<code>/hack WiFi security</code>\n<code>/hack How to add security to your device</code>',
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
<code>/ask &lt;question&gt;</code> - Ask AI with knowledge base (interactive)
<code>/search &lt;query&gt;</code> - Search PDF knowledge base
<code>/hack &lt;topic&gt;</code> - Get interactive hacking guide
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

// ============== CALLBACK HANDLERS (REWRITTEN WITH HACK FOLLOW-UPS) ==============

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  // Handle hack follow-ups
  if (data.startsWith('deep_') || data.startsWith('commands_') || data.startsWith('mistakes_') || data.startsWith('checklist_')) {
    const [type, ...topicParts] = data.split('_');
    const topic = topicParts.join('_');
    
    await bot.answerCallbackQuery(query.id, { text: '🔓 Generating...' });
    
    let prompt = '';
    let title = '';
    
    switch(type) {
      case 'deep':
        title = `🔍 Deep Dive: ${topic}`;
        prompt = `Provide an advanced, technical deep dive into "${topic}". Include internals, protocols, packet-level details, and advanced techniques. Assume the user knows basics.`;
        break;
      case 'commands':
        title = `🛠️ Commands for: ${topic}`;
        prompt = `List all specific terminal commands, tools, and exact syntax needed for "${topic}". Format as copy-paste ready commands with explanations. Include Linux/Windows variants where relevant.`;
        break;
      case 'mistakes':
        title = `⚠️ Common Mistakes: ${topic}`;
        prompt = `What are the most common mistakes beginners make when learning or attempting "${topic}"? For each mistake, explain why it's wrong and how to do it correctly.`;
        break;
      case 'checklist':
        title = `📋 Checklist: ${topic}`;
        prompt = `Create a practical checklist for "${topic}" that the user can follow step-by-step. Include [ ] checkboxes format, prerequisites, and verification steps for each item.`;
        break;
    }
    
    try {
      const { context } = kb.getContext(topic);
      const response = await ai.generateResponse(prompt, context || '');
      
      await bot.sendMessage(chatId, 
        `<b>${title}</b>\n\n${response.text}`, 
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      bot.sendMessage(chatId, `❌ Error: ${error.message}`, { parse_mode: 'HTML' });
    }
    return;
  }

  // Handle /ask follow-ups
  if (data.startsWith('helpful_') || data.startsWith('nothelpful_') || data.startsWith('explain_') || data.startsWith('example_')) {
    const [type, ...rest] = data.split('_');
    const param = rest.join('_');
    
    await bot.answerCallbackQuery(query.id, { text: 'Processing...' });
    
    if (type === 'helpful') {
      await bot.sendMessage(chatId, '✅ <b>Glad it helped!</b> Ask another question anytime.', { parse_mode: 'HTML' });
    } else if (type === 'nothelpful') {
      await bot.sendMessage(chatId, '❌ <b>Sorry about that.</b> Try rephrasing your question or use <code>/ask</code> with more details.', { parse_mode: 'HTML' });
    } else if (type === 'explain') {
      try {
        const { context } = kb.getContext(param);
        const response = await ai.generateResponse(`Explain "${param}" in much more detail. Break down every concept, use analogies, and ensure a beginner can fully understand.`, context || '');
        await bot.sendMessage(chatId, `🔍 <b>Detailed Explanation: ${param}</b>\n\n${response.text}`, { parse_mode: 'HTML' });
      } catch (error) {
        bot.sendMessage(chatId, `❌ Error: ${error.message}`, { parse_mode: 'HTML' });
      }
    } else if (type === 'example') {
      try {
        const { context } = kb.getContext(param);
        const response = await ai.generateResponse(`Provide a complete, practical, real-world example for "${param}". Include the scenario, step-by-step execution, expected output, and troubleshooting tips.`, context || '');
        await bot.sendMessage(chatId, `🛠️ <b>Practical Example: ${param}</b>\n\n${response.text}`, { parse_mode: 'HTML' });
      } catch (error) {
        bot.sendMessage(chatId, `❌ Error: ${error.message}`, { parse_mode: 'HTML' });
      }
    }
    return;
  }

  // Force join verification
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

console.log('\n🤖 Bot is running and listening for messages...\n');
