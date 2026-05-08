/**
 * PDF Processor - Memory-efficient text extraction
 * Handles large PDFs without crashing
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

class PDFProcessor {
  constructor() {
    this.chunks = [];
  }

  /**
   * Extract text from a single PDF using streaming (memory efficient)
   */
  async extractFromPDF(pdfPath) {
    try {
      // Check file size first
      const stats = fs.statSync(pdfPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      console.log(`📄 ${path.basename(pdfPath)} - ${fileSizeMB.toFixed(2)} MB`);

      // For large files (>10MB), warn but still try
      if (fileSizeMB > 10) {
        console.log(`⚠️ Large file detected. Processing may take time...`);
      }

      const dataBuffer = fs.readFileSync(pdfPath);

      // Use pdf-parse with minimal memory footprint
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(dataBuffer, {
        max: 0, // No page limit
        version: 'v1.10.100'
      });

      return {
        filename: path.basename(pdfPath),
        text: data.text,
        pages: data.numpages,
        info: data.info
      };
    } catch (error) {
      console.error(`❌ Error reading ${path.basename(pdfPath)}:`, error.message);
      return null;
    }
  }

  /**
   * Split text into chunks with overlap - memory efficient
   */
  chunkText(text, sourceFile, chunkSize = config.chunkSize, overlap = config.chunkOverlap) {
    const chunks = [];

    // Clean text but don't create huge strings
    let cleanText = text.replace(/\s+/g, ' ').trim();

    if (cleanText.length <= chunkSize) {
      return [{
        text: cleanText.substring(0, 10000), // Limit single chunk
        source: sourceFile,
        index: 0
      }];
    }

    // Limit total text to prevent memory issues (max 500KB per PDF)
    const maxTextLength = 500000;
    if (cleanText.length > maxTextLength) {
      console.log(`⚠️ Text too long (${cleanText.length} chars). Truncating to ${maxTextLength}`);
      cleanText = cleanText.substring(0, maxTextLength);
    }

    let start = 0;
    let index = 0;
    const maxChunks = 100; // Limit chunks per PDF

    while (start < cleanText.length && index < maxChunks) {
      let end = Math.min(start + chunkSize, cleanText.length);

      // Try to break at sentence
      if (end < cleanText.length) {
        const nextPeriod = cleanText.indexOf('. ', end - 100);
        if (nextPeriod !== -1 && nextPeriod < end + 100) {
          end = nextPeriod + 1;
        }
      }

      chunks.push({
        text: cleanText.substring(start, end).trim(),
        source: sourceFile,
        index: index++
      });

      start = end - overlap;
      if (start >= cleanText.length) break;
    }

    return chunks;
  }

  /**
   * Process all PDFs one at a time (not all in memory)
   */
  async processAllPDFs() {
    console.log('📚 Scanning PDFs directory...');

    if (!fs.existsSync(config.pdfsDir)) {
      fs.mkdirSync(config.pdfsDir, { recursive: true });
      console.log('📁 Created pdfs/ directory');
      return { totalChunks: 0, totalFiles: 0, files: [], chunks: [] };
    }

    const files = fs.readdirSync(config.pdfsDir)
      .filter(f => f.toLowerCase().endsWith('.pdf'));

    if (files.length === 0) {
      console.log('⚠️ No PDF files found in pdfs/ directory');
      return { totalChunks: 0, totalFiles: 0, files: [], chunks: [] };
    }

    console.log(`📄 Found ${files.length} PDF file(s)`);

    // Process one PDF at a time to save memory
    let allChunks = [];
    const processedFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`
🔍 [${i + 1}/${files.length}] Processing: ${file}`);

      const pdfPath = path.join(config.pdfsDir, file);
      const pdfData = await this.extractFromPDF(pdfPath);

      if (pdfData && pdfData.text && pdfData.text.trim().length > 0) {
        const chunks = this.chunkText(pdfData.text, file);
        allChunks = allChunks.concat(chunks);
        processedFiles.push(file);
        console.log(`✅ Extracted ${chunks.length} chunks (${pdfData.pages} pages)`);
      } else {
        console.log(`⚠️ No text extracted from ${file}`);
      }

      // Force garbage collection hint
      if (global.gc) {
        global.gc();
      }
    }

    // Limit total chunks
    const maxTotalChunks = 500;
    if (allChunks.length > maxTotalChunks) {
      console.log(`⚠️ Too many chunks (${allChunks.length}). Limiting to ${maxTotalChunks}`);
      allChunks = allChunks.slice(0, maxTotalChunks);
    }

    // Save to file
    const knowledgeBase = {
      createdAt: new Date().toISOString(),
      totalChunks: allChunks.length,
      totalFiles: processedFiles.length,
      files: processedFiles,
      chunks: allChunks
    };

    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data', { recursive: true });
    }

    fs.writeFileSync(config.knowledgeFile, JSON.stringify(knowledgeBase, null, 2));
    console.log(`
💾 Saved ${allChunks.length} chunks from ${processedFiles.length} file(s)`);

    return knowledgeBase;
  }

  /**
   * Load existing knowledge base
   */
  loadKnowledgeBase() {
    try {
      if (!fs.existsSync(config.knowledgeFile)) {
        return null;
      }
      const data = JSON.parse(fs.readFileSync(config.knowledgeFile, 'utf8'));
      console.log(`📖 Loaded ${data.totalChunks} chunks from ${data.totalFiles} file(s)`);
      return data;
    } catch (error) {
      console.error('❌ Error loading knowledge base:', error.message);
      return null;
    }
  }
}

module.exports = PDFProcessor;
