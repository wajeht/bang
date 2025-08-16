const { build } = require('esbuild');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

function getAllJsFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            getAllJsFiles(fullPath, files);
        } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) {
            files.push(fullPath);
        }
    }

    return files;
}

async function minifyFiles() {
    console.log('Starting minification...');

    const jsFiles = getAllJsFiles(distDir);
    console.log(`Found ${jsFiles.length} JavaScript files to minify`);

    let totalOriginalSize = 0;
    let totalMinifiedSize = 0;

    for (const file of jsFiles) {
        const originalSize = fs.statSync(file).size;
        totalOriginalSize += originalSize;

        try {
            const result = await build({
                entryPoints: [file],
                outfile: file,
                allowOverwrite: true,
                minify: true,
                keepNames: true, // Preserve function names for better stack traces
                sourcemap: false, // Remove sourcemaps for production
                target: 'node22',
                platform: 'node',
                format: 'cjs',
                logLevel: 'error',
            });

            const minifiedSize = fs.statSync(file).size;
            totalMinifiedSize += minifiedSize;

            const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
            console.log(`✓ ${path.relative(distDir, file)} (${reduction}% smaller)`);
        } catch (error) {
            console.error(`✗ Failed to minify ${path.relative(distDir, file)}: ${error.message}`);
            process.exit(1);
        }
    }

    const totalReduction = ((1 - totalMinifiedSize / totalOriginalSize) * 100).toFixed(1);
    console.log(`\nMinification complete!`);
    console.log(`Total size reduction: ${totalReduction}%`);
    console.log(`Original: ${(totalOriginalSize / 1024).toFixed(1)} KB`);
    console.log(`Minified: ${(totalMinifiedSize / 1024).toFixed(1)} KB`);
    console.log(`Saved: ${((totalOriginalSize - totalMinifiedSize) / 1024).toFixed(1)} KB`);
}

minifyFiles().catch((error) => {
    console.error('Minification failed:', error);
    process.exit(1);
});
