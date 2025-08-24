import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

interface ExtractionResult {
    success: boolean;
    outputPath?: string;
    error?: string;
    usageLength?: number;
    htmlLength?: number;
}

async function extractReadmeUsage(): Promise<ExtractionResult> {
    try {
        const readmePath = path.join(__dirname, '..', 'README.md');

        if (!fs.existsSync(readmePath)) {
            return {
                success: false,
                error: 'README.md not found',
            };
        }

        const readmeContent = fs.readFileSync(readmePath, 'utf8');

        const start = '<!-- starts -->';
        const end = '<!-- ends -->';

        const startIndex = readmeContent.indexOf(start);
        const endIndex = readmeContent.indexOf(end);

        if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
            return {
                success: false,
                error: 'Could not find usage section markers in README.md. Expected <!-- starts --> and <!-- ends --> markers.',
            };
        }

        const usageContent = readmeContent.slice(startIndex + start.length, endIndex).trim();

        if (!usageContent) {
            return {
                success: false,
                error: 'Usage content is empty between markers',
            };
        }

        // Convert markdown to HTML
        const html = await marked(usageContent);

        // Ensure src/routes/_components directory exists
        const componentsDir = path.join(__dirname, '..', 'src', 'routes', '_components');
        if (!fs.existsSync(componentsDir)) {
            fs.mkdirSync(componentsDir, { recursive: true });
        }

        // Write HTML file
        const outputPath = path.join(componentsDir, 'readme-usage.html');
        fs.writeFileSync(outputPath, html, 'utf8');

        return {
            success: true,
            outputPath,
            usageLength: usageContent.length,
            htmlLength: html.length,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
}

function printExtractionTable(result: ExtractionResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('README EXTRACTION SUMMARY');
    console.log('='.repeat(60));

    if (result.success && result.outputPath) {
        console.log('STATUS:'.padEnd(20) + '✅ SUCCESS');
        console.log('OUTPUT FILE:'.padEnd(20) + path.relative(process.cwd(), result.outputPath));
        console.log('MARKDOWN SIZE:'.padEnd(20) + `${result.usageLength} characters`);
        console.log('HTML SIZE:'.padEnd(20) + `${result.htmlLength} characters`);
        console.log(
            'COMPRESSION:'.padEnd(20) +
                `${((result.htmlLength! / result.usageLength! - 1) * 100).toFixed(1)}%`,
        );
    } else {
        console.log('STATUS:'.padEnd(20) + '❌ FAILED');
        console.log('ERROR:'.padEnd(20) + result.error);
    }

    console.log('='.repeat(60));
}

async function main(): Promise<void> {
    console.log('🔍 Extracting README usage section...\n');

    const result = await extractReadmeUsage();

    printExtractionTable(result);

    if (!result.success) {
        console.error('\n❌ README extraction failed!');
        process.exit(1);
    } else {
        console.log('\n✅ README extraction completed successfully!');
    }
}

main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});
