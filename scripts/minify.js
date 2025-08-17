const { build } = require('esbuild');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const viewsDir = path.join(__dirname, '..', 'src', 'routes');
const publicDir = path.join(__dirname, '..', 'public');

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

function getAllHtmlFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            getAllHtmlFiles(fullPath, files);
        } else if (entry.name.endsWith('.html')) {
            files.push(fullPath);
        }
    }

    return files;
}

function getAllCssFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            getAllCssFiles(fullPath, files);
        } else if (entry.name.endsWith('.css') && !entry.name.endsWith('.min.css')) {
            files.push(fullPath);
        }
    }

    return files;
}

async function minifyJavaScript() {
    console.log('Minifying JavaScript files...');

    const jsFiles = getAllJsFiles(distDir);
    console.log(`Found ${jsFiles.length} JavaScript files`);

    let totalOriginalSize = 0;
    let totalMinifiedSize = 0;

    for (const file of jsFiles) {
        const originalSize = fs.statSync(file).size;
        totalOriginalSize += originalSize;

        try {
            await build({
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
    console.log(`\nJavaScript minification complete!`);
    console.log(`Total size reduction: ${totalReduction}%`);
    console.log(`Original: ${(totalOriginalSize / 1024).toFixed(1)} KB`);
    console.log(`Minified: ${(totalMinifiedSize / 1024).toFixed(1)} KB`);
    console.log(`Saved: ${((totalOriginalSize - totalMinifiedSize) / 1024).toFixed(1)} KB\n`);
}

async function minifyHtmlFiles() {
    console.log('Minifying HTML files...');

    const htmlFiles = getAllHtmlFiles(viewsDir);
    console.log(`Found ${htmlFiles.length} HTML files`);

    let totalOriginalSize = 0;
    let totalMinifiedSize = 0;

    const minifyOptions = {
        collapseWhitespace: true,
        removeComments: true,
        removeOptionalTags: false, // Keep optional tags for EJS compatibility
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype: true,
        minifyCSS: true,
        minifyJS: false, // Disabled to preserve inline script functionality
        conservativeCollapse: true, // Preserve single spaces for EJS
        preserveLineBreaks: false,
        removeEmptyAttributes: true,
        removeAttributeQuotes: false, // Keep quotes for EJS compatibility
        keepClosingSlash: true,
        ignoreCustomFragments: [
            /<%[\s\S]*?%>/, // EJS tags
            /<\?[\s\S]*?\?>/, // PHP-style tags (sometimes used in templates)
        ],
    };

    for (const file of htmlFiles) {
        const originalContent = fs.readFileSync(file, 'utf8');
        const originalSize = Buffer.byteLength(originalContent, 'utf8');
        totalOriginalSize += originalSize;

        try {
            const minifiedContent = await minifyHtml(originalContent, minifyOptions);
            fs.writeFileSync(file, minifiedContent, 'utf8');

            const minifiedSize = Buffer.byteLength(minifiedContent, 'utf8');
            totalMinifiedSize += minifiedSize;

            const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
            console.log(`✓ ${path.relative(viewsDir, file)} (${reduction}% smaller)`);
        } catch (error) {
            console.error(`✗ Failed to minify ${path.relative(viewsDir, file)}: ${error.message}`);
            // Don't exit on HTML minification errors, just skip the file
        }
    }

    const totalReduction = ((1 - totalMinifiedSize / totalOriginalSize) * 100).toFixed(1);
    console.log(`\nHTML minification complete!`);
    console.log(`Total size reduction: ${totalReduction}%`);
    console.log(`Original: ${(totalOriginalSize / 1024).toFixed(1)} KB`);
    console.log(`Minified: ${(totalMinifiedSize / 1024).toFixed(1)} KB`);
    console.log(`Saved: ${((totalOriginalSize - totalMinifiedSize) / 1024).toFixed(1)} KB\n`);
}

async function minifyCssFiles() {
    console.log('Minifying CSS files...');

    const cssFiles = getAllCssFiles(publicDir);
    console.log(`Found ${cssFiles.length} CSS files`);

    if (cssFiles.length === 0) {
        console.log('No CSS files to minify\n');
        return;
    }

    let totalOriginalSize = 0;
    let totalMinifiedSize = 0;

    const cleanCSS = new CleanCSS({
        level: {
            1: {
                all: true,
                specialComments: false,
            },
            2: {
                all: true,
                restructureRules: true,
            },
        },
        compatibility: '*', // For maximum compatibility
        sourceMap: false,
    });

    for (const file of cssFiles) {
        const originalContent = fs.readFileSync(file, 'utf8');
        const originalSize = Buffer.byteLength(originalContent, 'utf8');
        totalOriginalSize += originalSize;

        try {
            const output = cleanCSS.minify(originalContent);

            if (output.errors.length > 0) {
                console.error(
                    `✗ Errors minifying ${path.relative(publicDir, file)}:`,
                    output.errors,
                );
                continue;
            }

            if (output.warnings.length > 0) {
                console.warn(`⚠ Warnings for ${path.relative(publicDir, file)}:`, output.warnings);
            }

            fs.writeFileSync(file, output.styles, 'utf8');
            const minifiedSize = Buffer.byteLength(output.styles, 'utf8');
            totalMinifiedSize += minifiedSize;

            const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
            console.log(`✓ ${path.relative(publicDir, file)} (${reduction}% smaller)`);
        } catch (error) {
            console.error(`✗ Failed to minify ${path.relative(publicDir, file)}: ${error.message}`);
            // Don't exit on CSS minification errors, just skip the file
        }
    }

    const totalReduction = ((1 - totalMinifiedSize / totalOriginalSize) * 100).toFixed(1);
    console.log(`\nCSS minification complete!`);
    console.log(`Total size reduction: ${totalReduction}%`);
    console.log(`Original: ${(totalOriginalSize / 1024).toFixed(1)} KB`);
    console.log(`Minified: ${(totalMinifiedSize / 1024).toFixed(1)} KB`);
    console.log(`Saved: ${((totalOriginalSize - totalMinifiedSize) / 1024).toFixed(1)} KB\n`);
}

async function minifyAll() {
    console.log('Starting minification process...\n');

    try {
        await minifyJavaScript();
        await minifyHtmlFiles();
        await minifyCssFiles();
        console.log('All minification complete!');
    } catch (error) {
        console.error('Minification failed:', error);
        process.exit(1);
    }
}

minifyAll();
