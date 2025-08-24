import { build } from 'esbuild';
import { minify as minifyHtml } from 'html-minifier-terser';
import CleanCSS from 'clean-css';
import fs from 'fs';
import path from 'path';
import { logger } from '../src/utils/logger';

const distDir = path.join(__dirname, '..', 'dist');
const viewsDir = path.join(__dirname, '..', 'src', 'routes');
const publicDir = path.join(__dirname, '..', 'public');

interface MinificationResult {
    file: string;
    originalSize: number;
    minifiedSize: number;
    reduction: string;
    status: 'success' | 'error';
    error?: string;
}

interface MinificationSummary {
    type: 'JavaScript' | 'HTML' | 'CSS';
    results: MinificationResult[];
    totalOriginalSize: number;
    totalMinifiedSize: number;
    totalReduction: string;
}

function getAllJsFiles(dir: string, files: string[] = []): string[] {
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

function getAllHtmlFiles(dir: string, files: string[] = []): string[] {
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

function getAllCssFiles(dir: string, files: string[] = []): string[] {
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

function printMinificationTable(summaries: MinificationSummary[]): void {
    logger.info('\n🎯 MINIFICATION SUMMARY');

    for (const summary of summaries) {
        if (summary.results.length === 0) continue;

        logger.info(`\n📁 ${summary.type.toUpperCase()} FILES:`);

        const tableData = summary.results.map((result) => ({
            Status: result.status === 'success' ? '✅' : '❌',
            File: result.file.length > 40 ? '...' + result.file.slice(-37) : result.file,
            'Original (KB)': (result.originalSize / 1024).toFixed(1) + ' KB',
            'Minified (KB)': (result.minifiedSize / 1024).toFixed(1) + ' KB',
            'Saved (%)': result.reduction + '%',
            Error: result.error || '',
        }));

        logger.table(tableData, [
            'Status',
            'File',
            'Original (KB)',
            'Minified (KB)',
            'Saved (%)',
            'Error',
        ]);

        logger.info(
            `📊 TOTAL ${summary.type.toUpperCase()}: ${(summary.totalOriginalSize / 1024).toFixed(1)} KB → ${(summary.totalMinifiedSize / 1024).toFixed(1)} KB (${summary.totalReduction}% reduction)`,
        );
        logger.info(`📈 FILES PROCESSED: ${summary.results.length}`);
        logger.info(
            `💾 SPACE SAVED: ${((summary.totalOriginalSize - summary.totalMinifiedSize) / 1024).toFixed(1)} KB`,
        );
    }

    const grandTotalOriginal = summaries.reduce((sum, s) => sum + s.totalOriginalSize, 0);
    const grandTotalMinified = summaries.reduce((sum, s) => sum + s.totalMinifiedSize, 0);
    const grandTotalReduction = ((1 - grandTotalMinified / grandTotalOriginal) * 100).toFixed(1);

    logger.info('\n🎉 GRAND TOTAL SUMMARY:');
    const grandTotalData = [
        {
            'Total Original (KB)': (grandTotalOriginal / 1024).toFixed(1) + ' KB',
            'Total Minified (KB)': (grandTotalMinified / 1024).toFixed(1) + ' KB',
            'Total Reduction (%)': grandTotalReduction + '%',
            'Total Saved (KB)':
                ((grandTotalOriginal - grandTotalMinified) / 1024).toFixed(1) + ' KB',
        },
    ];

    logger.table(grandTotalData);
}

async function minifyJavaScript(): Promise<MinificationSummary> {
    const jsFiles = getAllJsFiles(distDir);
    const results: MinificationResult[] = [];
    let totalOriginalSize = 0;
    let totalMinifiedSize = 0;

    logger.info(`🔄 Processing ${jsFiles.length} JavaScript files...`);

    for (const file of jsFiles) {
        const originalSize = fs.statSync(file).size;
        totalOriginalSize += originalSize;

        try {
            await build({
                entryPoints: [file],
                outfile: file,
                allowOverwrite: true,
                minify: true,
                keepNames: true,
                sourcemap: false,
                target: 'node22',
                platform: 'node',
                format: 'cjs',
                logLevel: 'error',
            });

            const minifiedSize = fs.statSync(file).size;
            totalMinifiedSize += minifiedSize;

            const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);

            results.push({
                file: path.relative(distDir, file),
                originalSize,
                minifiedSize,
                reduction,
                status: 'success',
            });
        } catch (error) {
            results.push({
                file: path.relative(distDir, file),
                originalSize,
                minifiedSize: originalSize,
                reduction: '0.0',
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            totalMinifiedSize += originalSize; // Add original size if minification failed
        }
    }

    const totalReduction = ((1 - totalMinifiedSize / totalOriginalSize) * 100).toFixed(1);

    return {
        type: 'JavaScript',
        results,
        totalOriginalSize,
        totalMinifiedSize,
        totalReduction,
    };
}

async function minifyHtmlFiles(): Promise<MinificationSummary> {
    const htmlFiles = getAllHtmlFiles(viewsDir);
    const results: MinificationResult[] = [];
    let totalOriginalSize = 0;
    let totalMinifiedSize = 0;

    logger.info(`🔄 Processing ${htmlFiles.length} HTML files...`);

    const minifyOptions = {
        collapseWhitespace: true,
        removeComments: true,
        removeOptionalTags: false,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype: true,
        minifyCSS: true,
        minifyJS: {
            compress: false,
            mangle: false,
            output: {
                comments: false,
            },
        },
        conservativeCollapse: true,
        preserveLineBreaks: false,
        removeEmptyAttributes: true,
        removeAttributeQuotes: false,
        keepClosingSlash: true,
        ignoreCustomFragments: [/<%[\s\S]*?%>/, /<\?[\s\S]*?\?>/],
    };

    for (const file of htmlFiles) {
        const originalContent = fs.readFileSync(file, 'utf8');
        const originalSize = Buffer.byteLength(originalContent, 'utf8');
        totalOriginalSize += originalSize;

        try {
            const minifiedContent = (await minifyHtml(originalContent, minifyOptions)) as string;
            fs.writeFileSync(file, minifiedContent, 'utf8');

            const minifiedSize = Buffer.byteLength(minifiedContent, 'utf8');
            totalMinifiedSize += minifiedSize;

            const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);

            results.push({
                file: path.relative(viewsDir, file),
                originalSize,
                minifiedSize,
                reduction,
                status: 'success',
            });
        } catch (error) {
            results.push({
                file: path.relative(viewsDir, file),
                originalSize,
                minifiedSize: originalSize,
                reduction: '0.0',
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            totalMinifiedSize += originalSize;
        }
    }

    const totalReduction = ((1 - totalMinifiedSize / totalOriginalSize) * 100).toFixed(1);

    return {
        type: 'HTML',
        results,
        totalOriginalSize,
        totalMinifiedSize,
        totalReduction,
    };
}

async function minifyCssFiles(): Promise<MinificationSummary> {
    const cssFiles = getAllCssFiles(publicDir);
    const results: MinificationResult[] = [];
    let totalOriginalSize = 0;
    let totalMinifiedSize = 0;

    logger.info(`🔄 Processing ${cssFiles.length} CSS files...`);

    if (cssFiles.length === 0) {
        return {
            type: 'CSS',
            results: [],
            totalOriginalSize: 0,
            totalMinifiedSize: 0,
            totalReduction: '0.0',
        };
    }

    const cleanCSS = new CleanCSS({
        level: {
            1: {
                all: true,
                specialComments: '0',
            },
            2: {
                all: true,
                restructureRules: true,
            },
        },
        compatibility: '*',
        sourceMap: false,
    });

    for (const file of cssFiles) {
        const originalContent = fs.readFileSync(file, 'utf8');
        const originalSize = Buffer.byteLength(originalContent, 'utf8');
        totalOriginalSize += originalSize;

        try {
            const output = await cleanCSS.minify(originalContent);

            if (output.errors.length > 0) {
                results.push({
                    file: path.relative(publicDir, file),
                    originalSize,
                    minifiedSize: originalSize,
                    reduction: '0.0',
                    status: 'error',
                    error: output.errors.join(', '),
                });
                totalMinifiedSize += originalSize;
                continue;
            }

            fs.writeFileSync(file, output.styles, 'utf8');
            const minifiedSize = Buffer.byteLength(output.styles, 'utf8');
            totalMinifiedSize += minifiedSize;

            const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);

            results.push({
                file: path.relative(publicDir, file),
                originalSize,
                minifiedSize,
                reduction,
                status: 'success',
            });

            if (output.warnings.length > 0) {
                logger.warn(`⚠ Warnings for ${path.relative(publicDir, file)}:`, output.warnings);
            }
        } catch (error) {
            results.push({
                file: path.relative(publicDir, file),
                originalSize,
                minifiedSize: originalSize,
                reduction: '0.0',
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            totalMinifiedSize += originalSize;
        }
    }

    const totalReduction = ((1 - totalMinifiedSize / totalOriginalSize) * 100).toFixed(1);

    return {
        type: 'CSS',
        results,
        totalOriginalSize,
        totalMinifiedSize,
        totalReduction,
    };
}

async function minifyAll(): Promise<void> {
    logger.info('🚀 Starting minification process...');

    try {
        const [jsSummary, htmlSummary, cssSummary] = await Promise.all([
            minifyJavaScript(),
            minifyHtmlFiles(),
            minifyCssFiles(),
        ]);

        printMinificationTable([jsSummary, htmlSummary, cssSummary]);

        const hasErrors = [jsSummary, htmlSummary, cssSummary].some((summary) =>
            summary.results.some((result) => result.status === 'error'),
        );

        if (hasErrors) {
            logger.warn('⚠️  Some files failed to minify, but the process completed.');
            process.exit(1);
        } else {
            logger.info('✅ All minification completed successfully!');
        }
    } catch (error) {
        logger.error('❌ Minification failed: %o', error);
        process.exit(1);
    }
}

minifyAll();
