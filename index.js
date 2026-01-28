const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'cookbook-pdf-service' });
});

// PDF generation endpoint
app.post('/generate-pdf', async (req, res) => {
  const { user_id, cookbook_id, cookbook_data, supabase_url, supabase_service_key } = req.body;

  if (!user_id || !cookbook_id || !cookbook_data || !supabase_url || !supabase_service_key) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  let browser;
  try {
    console.log(`Generating PDF for cookbook: ${cookbook_id}`);

    // Generate HTML from cookbook data
    const html = generateCookbookHTML(cookbook_data);

    // Launch Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });

    await browser.close();
    browser = null;

    // Upload to Supabase Storage
    const supabase = createClient(supabase_url, supabase_service_key);
    const filePath = `${user_id}/${cookbook_id}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('ebook-exports')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return res.status(500).json({ success: false, error: 'Failed to upload PDF' });
    }

    // Get signed URL (valid for 1 year)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('ebook-exports')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);

    if (urlError) {
      console.error('URL error:', urlError);
      return res.status(500).json({ success: false, error: 'Failed to get PDF URL' });
    }

    console.log(`PDF generated and uploaded: ${filePath}`);

    res.json({
      success: true,
      pdf_url: urlData.signedUrl,
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    if (browser) await browser.close();
    res.status(500).json({ success: false, error: error.message });
  }
});

// HTML generation function
function generateCookbookHTML(data) {
  const { name, author, cover, toc_style, front_matter_pages, recipes, content_order, dividers } = data;

  // Build recipe pages HTML
  let recipePagesHTML = '';
  
  // Create maps for ordering
  const recipeMap = new Map(recipes.map(r => [r.id, r]));
  const dividerMap = new Map((dividers || []).map(d => [d.id, d]));

  // Use content_order if provided, otherwise just use recipes array
  const orderedContent = content_order && content_order.length > 0 
    ? content_order 
    : recipes.map(r => ({ id: r.id, type: 'recipe' }));

  for (const item of orderedContent) {
    if (item.type === 'recipe') {
      const recipe = recipeMap.get(item.id);
      if (recipe) {
        recipePagesHTML += generateRecipeHTML(recipe, author);
      }
    } else if (item.type === 'divider') {
      const divider = dividerMap.get(item.id);
      if (divider) {
        recipePagesHTML += generateDividerHTML(divider);
      }
    }
  }

  // Build front matter HTML
  let frontMatterHTML = '';
  if (front_matter_pages && front_matter_pages.length > 0) {
    for (const page of front_matter_pages) {
      frontMatterHTML += generateFrontMatterPageHTML(page);
    }
  }

  // Build TOC HTML
  const tocHTML = generateTOCHTML(recipes, toc_style);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        ${getBaseStyles()}
      </style>
    </head>
    <body>
      ${generateCoverHTML(name, author, cover)}
      ${frontMatterHTML}
      ${tocHTML}
      ${recipePagesHTML}
    </body>
    </html>
  `;
}

function getBaseStyles() {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Georgia', serif;
      color: #2A2722;
      background: #FAF5F1;
    }
    
    .page {
      width: 8.5in;
      min-height: 11in;
      padding: 0.75in;
      page-break-after: always;
      background: #FAF5F1;
    }
    
    .page:last-child {
      page-break-after: avoid;
    }
    
    /* Cover page */
    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    
    .cover-photo {
      width: 4in;
      height: 4in;
      object-fit: cover;
      border-radius: 8px;
      margin-bottom: 32px;
    }
    
    .cover-title {
      font-size: 36px;
      font-weight: bold;
      margin-bottom: 16px;
      color: #2A2722;
    }
    
    .cover-author {
      font-size: 18px;
      color: #666;
      margin-bottom: 8px;
    }
    
    .cover-year {
      font-size: 14px;
      color: #999;
    }
    
    /* TOC page */
    .toc-page {
      padding-top: 1in;
    }
    
    .toc-title {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 32px;
      text-align: center;
    }
    
    .toc-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px dotted #ccc;
    }
    
    .toc-item-title {
      font-size: 14px;
    }
    
    .toc-item-page {
      font-size: 14px;
      color: #666;
    }
    
    /* Recipe pages */
    .recipe-info-page {
      padding-top: 0.5in;
    }
    
    .recipe-title {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 24px;
      color: #2A2722;
    }
    
    .recipe-section-title {
      font-size: 16px;
      font-weight: bold;
      margin: 24px 0 12px 0;
      color: #F4991B;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .recipe-list {
      list-style: none;
      padding: 0;
    }
    
    .recipe-list li {
      padding: 6px 0;
      font-size: 14px;
      line-height: 1.5;
    }
    
    .recipe-photo-page {
      display: flex;
      justify-content: center;
      align-items: center;
    }
    
    .recipe-photo {
      max-width: 100%;
      max-height: 9in;
      object-fit: contain;
      border-radius: 8px;
    }
    
    .recipe-photo-placeholder {
      width: 100%;
      height: 6in;
      background: #E8E2DC;
      border-radius: 8px;
      display: flex;
      justify-content: center;
      align-items: center;
      color: #999;
      font-size: 18px;
    }
    
    /* Divider page */
    .divider-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    
    .divider-title {
      font-size: 32px;
      font-weight: bold;
      margin-bottom: 16px;
    }
    
    .divider-subtitle {
      font-size: 18px;
      color: #666;
    }
    
    /* Front matter pages */
    .dedication-page, .foreword-page, .story-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    
    .dedication-text, .foreword-text, .story-text {
      font-size: 18px;
      line-height: 1.8;
      font-style: italic;
      max-width: 5in;
    }
    
    .story-title {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 24px;
    }
    
    .photo-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    
    .photo-page-image {
      max-width: 100%;
      max-height: 8in;
      object-fit: contain;
      border-radius: 8px;
    }
    
    .photo-caption {
      margin-top: 16px;
      font-size: 14px;
      color: #666;
      font-style: italic;
    }
    
    /* Page numbers */
    .page-number {
      position: absolute;
      bottom: 0.5in;
      right: 0.75in;
      font-size: 12px;
      color: #999;
    }
  `;
}

function generateCoverHTML(name, author, cover) {
  const photoHTML = cover && cover.photo_url 
    ? `<img src="${cover.photo_url}" class="cover-photo" />`
    : '';
  
  const titleText = (cover && cover.title) || name;
  const authorHTML = !cover || cover.author_visible !== false 
    ? `<div class="cover-author">by ${author}</div>` 
    : '';
  const yearHTML = cover && cover.year && cover.year_visible !== false 
    ? `<div class="cover-year">${cover.year}</div>` 
    : '';

  return `
    <div class="page cover-page">
      ${photoHTML}
      <h1 class="cover-title">${titleText}</h1>
      ${authorHTML}
      ${yearHTML}
    </div>
  `;
}

function generateFrontMatterPageHTML(page) {
  const { type, content } = page;
  
  switch (type) {
    case 'dedication':
      return `
        <div class="page dedication-page">
          <div class="dedication-text">${content.text || ''}</div>
        </div>
      `;
    case 'foreword':
      return `
        <div class="page foreword-page">
          <div class="foreword-text">${content.text || ''}</div>
        </div>
      `;
    case 'photo':
      return `
        <div class="page photo-page">
          ${content.photo_url ? `<img src="${content.photo_url}" class="photo-page-image" />` : ''}
          ${content.caption ? `<div class="photo-caption">${content.caption}</div>` : ''}
        </div>
      `;
    case 'story':
      return `
        <div class="page story-page">
          ${content.title ? `<h2 class="story-title">${content.title}</h2>` : ''}
          <div class="story-text">${content.text || ''}</div>
        </div>
      `;
    default:
      return '';
  }
}

function generateTOCHTML(recipes, tocStyle) {
  let pageNum = 2; // Start after cover + any front matter
  
  const itemsHTML = recipes.map((recipe, index) => {
    const recipePageNum = pageNum + (index * 2); // Each recipe is 2 pages
    return `
      <div class="toc-item">
        <span class="toc-item-title">${recipe.title}</span>
        <span class="toc-item-page">${recipePageNum}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="page toc-page">
      <h2 class="toc-title">Table of Contents</h2>
      ${itemsHTML}
    </div>
  `;
}

function generateRecipeHTML(recipe, author) {
  const ingredientsHTML = (recipe.ingredients || [])
    .map(ing => `<li>${ing}</li>`)
    .join('');
  
  const directionsHTML = (recipe.directions || [])
    .map((dir, i) => `<li>${i + 1}. ${dir}</li>`)
    .join('');

  const infoPage = `
    <div class="page recipe-info-page">
      <h2 class="recipe-title">${recipe.title}</h2>
      
      <h3 class="recipe-section-title">Ingredients</h3>
      <ul class="recipe-list">
        ${ingredientsHTML}
      </ul>
      
      <h3 class="recipe-section-title">Directions</h3>
      <ol class="recipe-list">
        ${directionsHTML}
      </ol>
    </div>
  `;

  const photoPage = `
    <div class="page recipe-photo-page">
      ${recipe.photo_url 
        ? `<img src="${recipe.photo_url}" class="recipe-photo" />`
        : `<div class="recipe-photo-placeholder">No photo</div>`
      }
    </div>
  `;

  return infoPage + photoPage;
}

function generateDividerHTML(divider) {
  return `
    <div class="page divider-page">
      <h2 class="divider-title">${divider.title}</h2>
      ${divider.subtitle ? `<p class="divider-subtitle">${divider.subtitle}</p>` : ''}
    </div>
  `;
}

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`PDF service running on port ${PORT}`);
  });
  
  // Keep the process alive
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });