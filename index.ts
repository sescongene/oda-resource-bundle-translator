import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import translate from 'google-translate-api-x';

// 1. Define only the languages you want to MODIFY
const TARGET_LANGS: Record<string, string> = {
    'zh': 'zh-CN',
    'tw': 'zh-TW',
    'ko': 'ko',
};

interface CsvRow {
    languageTag: string;
    key: string;
    message: string;
    [column: string]: string;
}

interface TranslationTask {
    rowIndex: number;
    key: string;
    maskedText: string;
    placeholders: string[];
}

async function runSmartTranslation(inputFile: string): Promise<void> {
    try {
        if (!fs.existsSync(inputFile)) {
            console.error(`❌ File not found: ${inputFile}`);
            process.exit(1);
        }

        const rawData = fs.readFileSync(inputFile, 'utf8');
        const records = parse(rawData, { columns: true, skip_empty_lines: true }) as CsvRow[];

        // 2. Build a Map of Default (English) messages to use as the translation source
        const defaultSourceMap = new Map<string, string>();
        records.forEach((row: CsvRow) => {
            if (row.languageTag === 'default') {
                defaultSourceMap.set(row.key, row.message);
            }
        });

        console.log('🔍 Scanning CSV and grouping tasks by language for batch translation...');

        // 3. Group all translation tasks by language (instead of translating row-by-row)
        const tasksByLang = new Map<string, TranslationTask[]>();
        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const lang = row.languageTag;
            if (!TARGET_LANGS[lang]) continue;

            const sourceText = defaultSourceMap.get(row.key);
            if (!sourceText) {
                console.warn(`⚠️ No 'default' message found for key: ${row.key}. Skipping.`);
                continue;
            }

            const { maskedText, placeholders } = maskHtml(sourceText);
            if (!tasksByLang.has(lang)) tasksByLang.set(lang, []);
            tasksByLang.get(lang)!.push({ rowIndex: i, key: row.key, maskedText, placeholders });
        }

        // 4. Translate all languages in parallel, each as a single batched API call
        await Promise.all(
            [...tasksByLang.entries()].map(async ([lang, tasks]) => {
                const targetLang = TARGET_LANGS[lang];
                console.log(`🚀 [${lang}] Sending batch of ${tasks.length} strings to translate...`);

                try {
                    const texts = tasks.map(t => t.maskedText);
                    const results = await translate(texts, { to: targetLang, rejectOnPartialFail: false });
                    const resultArray = Array.isArray(results) ? results : [results];

                    for (let i = 0; i < tasks.length; i++) {
                        const task = tasks[i];
                        const result = resultArray[i] as { text: string } | null;

                        if (!result) {
                            console.warn(`  ⚠️ [${lang}] Translation returned null for: ${task.key}. Skipping.`);
                            continue;
                        }

                        let translated: string = result.text;

                        // Restore HTML tags
                        task.placeholders.forEach((originalTag, idx) => {
                            translated = translated.replace(`[[${idx}]]`, originalTag);
                        });
                        translated = translated.replace(/\s+(?=<)/g, '').replace(/(?<=>)\s+/g, '').trim();

                        records[task.rowIndex].message = translated;
                        console.log(`  ✨ [${lang}] Translated: ${task.key}`);
                    }
                } catch (e) {
                    console.error(`❌ Batch translation failed for [${lang}]:`, (e as Error).message);
                }
            })
        );

        // 5. Save with "quoted_string: true" to ensure HTML is safe for ODA Import
        const outputCSV = stringify(records, {
            header: true,
            quoted_string: true,
        });

        const inputBaseName = path.basename(inputFile, path.extname(inputFile));
        const outputFile = `${inputBaseName}_translated.csv`;

        fs.writeFileSync(outputFile, outputCSV);
        console.log(`\n✅ Process Complete! Output saved to: ${outputFile}`);
        console.log("Records for 'de', 'fr', etc. were preserved.");
        console.log("Records for 'zh', 'tw', 'ko' were updated based on 'default' keys.");

    } catch (err) {
        console.error('Critical Error:', err);
        process.exit(1);
    }
}

/**
 * Masks HTML tags and entities with numbered placeholders so the translation
 * API doesn't corrupt them. Returns the masked text and the placeholder list
 * so they can be restored after translation.
 */
function maskHtml(text: string): { maskedText: string; placeholders: string[] } {
    const placeholders: string[] = [];
    const maskedText = text.replace(/(<[^>]+>|&[a-z]+;)/g, (match: string) => {
        placeholders.push(match);
        return ` [[${placeholders.length - 1}]] `;
    });
    return { maskedText, placeholders };
}

// Entry point: read input file from command-line argument
const inputFile = process.argv[2];

if (!inputFile) {
    console.error('❌ Usage: npm run translate -- <input-file.csv>');
    process.exit(1);
}

runSmartTranslation(inputFile);
