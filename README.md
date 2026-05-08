# 🤖 Hacking AI Bot

An AI-powered Telegram bot trained on your PDFs for hacking, cybersecurity, networking, and coding knowledge.

## ✨ Features

- 📚 **PDF Knowledge Base** - Upload your hacking PDFs and the bot learns from them
- 🧠 **Google Gemini AI** - Smart responses powered by Gemini 1.5 Flash
- 🔍 **Smart Search** - Finds relevant info from your PDFs automatically
- 📊 **Usage Stats** - Track bot usage and popular queries
- 👑 **Owner Panel** - Broadcast messages, manage users
- ⚡ **Fast Responses** - Optimized for quick replies

## 🚀 Setup (Pterodactyl)

### Step 1: Get API Keys

1. **Telegram Bot Token**: Message [@BotFather](https://t.me/BotFather) on Telegram, create a bot, copy the token
2. **Gemini API Key**: Go to [Google AI Studio](https://aistudio.google.com/app/apikey), create a free API key
3. **Your Telegram ID**: Message [@userinfobot](https://t.me/userinfobot) on Telegram to get your ID

### Step 2: Upload to Pterodactyl

1. Upload all files to your Pterodactyl server
2. Upload your PDF files to the `pdfs/` folder
3. Rename `.env.example` to `.env`
4. Fill in your API keys in `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
GEMINI_API_KEY=your_gemini_key_here
OWNER_ID=your_telegram_id_here
```

### Step 3: Install & Run

In the Pterodactyl console:
```bash
npm install
```

Then set the startup command to:
```bash
node index.js
```

Or click **Start** in the Pterodactyl panel.

### Step 4: Build Knowledge Base

After uploading PDFs, run:
```bash
npm run build-kb
```

Or use the `/reload` command in Telegram (owner only).

## 📚 Commands

| Command | Description | Access |
|---------|-------------|--------|
| `/start` | Welcome message | All |
| `/help` | Show all commands | All |
| `/ask <question>` | Ask AI with PDF context | All |
| `/search <query>` | Search knowledge base | All |
| `/hack <topic>` | Get hacking info | All |
| `/chat <message>` | Free chat with AI | All |
| `/status` | Bot status | All |
| `/sources` | List loaded PDFs | All |
| `/stats` | Usage statistics | All |
| `/about` | About the bot | All |
| `/ping` | Check latency | All |
| `/reload` | Reload all PDFs | Owner |
| `/broadcast <msg>` | Message all users | Owner |
| `/users` | List all users | Owner |

## 📁 Project Structure

```
hacking-ai-bot/
├── index.js              # Main bot file
├── config.js             # Configuration
├── pdfProcessor.js       # PDF text extraction
├── knowledgeBase.js      # Smart search system
├── aiEngine.js           # Gemini AI integration
├── stats.js              # Usage tracking
├── package.json          # Dependencies
├── .env.example          # Environment template
├── pdfs/                 # Upload your PDFs here
│   ├── cybersecurity-for-dummies.pdf
│   ├── coding-for-dummies.pdf
│   └── ...
├── data/                 # Auto-generated
│   ├── knowledge.json    # Processed PDF chunks
│   ├── stats.json        # Usage stats
│   └── users.json        # User data
└── scripts/
    └── buildKnowledgeBase.js
```

## 🧠 How It Works

1. **PDF Upload**: Drop your PDFs into `pdfs/`
2. **Processing**: Bot extracts text and splits into chunks
3. **Search**: When you ask a question, it finds the most relevant chunks
4. **AI Response**: Sends your question + relevant context to Gemini AI
5. **Answer**: You get a smart, contextual answer based on your PDFs

## 💡 Tips

- Use specific questions for better results: `/ask What is SQL injection and how to prevent it?`
- The more PDFs you add, the smarter the bot becomes
- Use `/hack` for quick hacking topic summaries
- The bot cites sources so you know which PDF the info came from

## 🔧 Troubleshooting

**Bot not responding?**
- Check that `TELEGRAM_BOT_TOKEN` is correct
- Check Pterodactyl logs for errors

**AI not working?**
- Verify `GEMINI_API_KEY` is set
- Check that you have internet access from the server

**PDFs not loading?**
- Make sure PDFs are in the `pdfs/` folder
- Run `/reload` command (owner only)
- Check that PDFs contain extractable text (not scanned images)

## 📜 License

MIT - Created by @TARRIFIC
