const fs = require('fs');
const path = require('path');

async function extractReadmeUsage() {
    try {
        const readmePath = path.join(__dirname, '..', 'README.md');
        const readmeContent = fs.readFileSync(readmePath, 'utf8');

        const start = '<!-- starts -->';
        const end = '<!-- ends -->';

        const startIndex = readmeContent.indexOf(start);
        const endIndex = readmeContent.indexOf(end);

        if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
            console.error('Could not find usage section markers in README.md');
            process.exit(1);
        }

        const usageContent = readmeContent.slice(startIndex + start.length, endIndex).trim();

        // Convert markdown to HTML
        const { marked } = require('marked');
        const html = await marked(usageContent);

        // Ensure src/routes directory exists
        const routesDir = path.join(__dirname, '..', 'src', 'routes');
        if (!fs.existsSync(routesDir)) {
            fs.mkdirSync(routesDir, { recursive: true });
        }

        // Write HTML file
        const outputPath = path.join(routesDir, 'readme-usage.html');
        fs.writeFileSync(outputPath, html, 'utf8');

        console.log(`✓ Extracted README usage to ${outputPath}`);
    } catch (error) {
        console.error('Failed to extract README usage:', error);
        process.exit(1);
    }
}

extractReadmeUsage();
