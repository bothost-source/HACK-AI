/**
 * Stats Manager - Track bot usage
 */

const fs = require('fs');
const config = require('./config');

class StatsManager {
  constructor() {
    this.stats = {
      totalMessages: 0,
      totalQueries: 0,
      totalUsers: 0,
      commandsUsed: {},
      users: {},
      startTime: Date.now()
    };

    // Ensure data directory exists
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data', { recursive: true });
    }

    this.load();
  }

  load() {
    try {
      if (fs.existsSync(config.statsFile)) {
        const data = JSON.parse(fs.readFileSync(config.statsFile, 'utf8'));
        this.stats = { ...this.stats, ...data };
      }
    } catch (error) {
      console.error('Stats load error:', error.message);
    }
  }

  save() {
    try {
      if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data', { recursive: true });
      }
      fs.writeFileSync(config.statsFile, JSON.stringify(this.stats, null, 2));
    } catch (error) {
      console.error('Stats save error:', error.message);
    }
  }

  trackUser(userId, username, firstName) {
    if (!this.stats.users[userId]) {
      this.stats.users[userId] = {
        username,
        firstName,
        firstSeen: new Date().toISOString(),
        messageCount: 0,
        queries: 0
      };
      this.stats.totalUsers++;
    }
    this.stats.users[userId].lastSeen = new Date().toISOString();
    this.stats.users[userId].messageCount++;
    this.stats.totalMessages++;
    this.save();
  }

  trackCommand(command) {
    this.stats.commandsUsed[command] = (this.stats.commandsUsed[command] || 0) + 1;
    this.stats.totalQueries++;
    this.save();
  }

  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

    return {
      ...this.stats,
      uptime: `${days}d ${hours}h ${minutes}m`,
      topCommands: Object.entries(this.stats.commandsUsed)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }
}

module.exports = StatsManager;
