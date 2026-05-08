/**
 * Build Knowledge Base Script
 * Run: node scripts/buildKnowledgeBase.js
 */

const PDFProcessor = require('../pdfProcessor');

async function build() {
  console.log('🔨 Building knowledge base from PDFs...');
  const processor = new PDFProcessor();
  await processor.processAllPDFs();
  console.log('✅ Done!');
  process.exit(0);
}

build().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
