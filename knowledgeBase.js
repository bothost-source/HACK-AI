/**
 * Knowledge Base - Smart search and retrieval system
 */

const fs = require('fs');
const config = require('./config');

class KnowledgeBase {
  constructor() {
    this.chunks = [];
    this.files = [];
    this.loaded = false;
  }

  /**
   * Load knowledge base from file
   */
  load() {
    try {
      if (!fs.existsSync(config.knowledgeFile)) {
        console.log('⚠️ Knowledge base not found. Run /reload or upload PDFs first.');
        return false;
      }

      const data = JSON.parse(fs.readFileSync(config.knowledgeFile, 'utf8'));
      this.chunks = data.chunks || [];
      this.files = data.files || [];
      this.loaded = true;

      console.log(`📖 Knowledge Base Loaded:`);
      console.log(`   • ${this.chunks.length} chunks`);
      console.log(`   • ${this.files.length} files: ${this.files.join(', ')}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to load knowledge base:', error.message);
      return false;
    }
  }

  /**
   * Simple TF-IDF inspired scoring
   */
  scoreRelevance(query, text) {
    const queryWords = query.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const textWords = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/);

    if (queryWords.length === 0) return 0;

    let score = 0;
    const textWordSet = new Set(textWords);

    for (const qWord of queryWords) {
      // Exact match bonus
      if (text.toLowerCase().includes(qWord)) {
        score += 2;
      }

      // Word frequency
      const freq = textWords.filter(w => w === qWord).length;
      score += freq * 0.5;

      // Partial match
      for (const tWord of textWordSet) {
        if (tWord.includes(qWord) || qWord.includes(tWord)) {
          score += 0.3;
        }
      }
    }

    // Normalize by query length
    return score / queryWords.length;
  }

  /**
   * Search for relevant chunks
   */
  search(query, topK = config.maxContextChunks) {
    if (!this.loaded || this.chunks.length === 0) {
      return { chunks: [], sources: [] };
    }

    const scored = this.chunks.map(chunk => ({
      ...chunk,
      score: this.scoreRelevance(query, chunk.text)
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Get top K unique chunks
    const topChunks = [];
    const usedSources = new Set();

    for (const chunk of scored) {
      if (topChunks.length >= topK) break;

      // Diversify sources
      const sourceCount = topChunks.filter(c => c.source === chunk.source).length;
      if (sourceCount < 2 || topChunks.length < 3) {
        topChunks.push(chunk);
        usedSources.add(chunk.source);
      }
    }

    return {
      chunks: topChunks,
      sources: Array.from(usedSources)
    };
  }

  /**
   * Get formatted context for AI
   */
  getContext(query) {
    const { chunks, sources } = this.search(query);

    if (chunks.length === 0) {
      return { context: '', sources: [], found: false };
    }

    let context = '\n=== KNOWLEDGE BASE CONTEXT ===\n';
    chunks.forEach((chunk, i) => {
      context += `\n[Source: ${chunk.source}]\n${chunk.text}\n`;
    });
    context += '\n=== END CONTEXT ===\n';

    return { context, sources, found: true };
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      loaded: this.loaded,
      totalChunks: this.chunks.length,
      totalFiles: this.files.length,
      files: this.files
    };
  }
}

module.exports = KnowledgeBase;
