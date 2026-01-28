const puppeteer = require('puppeteer');

async function scrapeWebsite() {
    let browser;

    try {
        console.log('Starting browser...');

        // Launch browser
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

        // Create new page
        const page = await browser.newPage();

        // Set viewport size
        await page.setViewport({ width: 1280, height: 720 });

        // Navigate to website
        console.log('Navigating to website...');
        await page.goto('https://railway.com', {
            waitUntil: 'networkidle2'
        });

        // Get page title
        const title = await page.title();
        console.log('Page title:', title);

        // Get text content from h1
        const heading = await page.$eval('h1', el => el.textContent);
        console.log('Main heading:', heading);

        // TODO: Add your scraping logic here
        // Examples:

        // Get all links
        // const links = await page.$$eval('a', links =>
        //   links.map(link => ({
        //     text: link.textContent,
        //     href: link.href
        //   }))
        // );

        // Fill out a form
        // await page.type('#search-input', 'your search term');
        // await page.click('#search-button');
        // await page.waitForNavigation();

        // Wait for specific element
        // await page.waitForSelector('.results', { timeout: 5000 });

        console.log('Scraping completed successfully!');

    } catch (error) {
        console.error('Error occurred:', error);
    } finally {
        // Always close the browser
        if (browser) {
            await browser.close();
            console.log('Browser closed');
        }
    }
}

// Run the scraping function
scrapeWebsite();