import path from 'path';
import fs from 'fs/promises';

type Config = {
    /** The complete file path where the generated llms.txt will be saved */
    outputFilePath: string;
    /** The root directory to start scanning from (usually project root) */
    rootPath: string;
    /** Array of directory/file names to skip during scanning */
    ignores: string[];
};

async function buildLlmsDotTxt(config: Config) {
    console.log(config);
}

async function main() {
    try {
        const config: Config = {
            outputFilePath: path.join(process.cwd(), 'public', 'llms.txt'),
            rootPath: process.cwd(),
            ignores: ['node_modules', '.git', 'tmp', 'bin'],
        };

        await buildLlmsDotTxt(config);
    } catch (error: any) {
        console.error(error);
    }
}

main().catch((error: any) => console.error(error));
