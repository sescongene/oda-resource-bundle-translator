# ODA Resource Bundle Translator

A CLI tool that automatically translates Oracle Digital Assistant (ODA) resource bundle CSV files using Google Translate. It handles batched translation per language, preserves HTML tags from being corrupted, and outputs a ready-to-import CSV.

---

## Features

- Translates resource bundle CSV files for multiple target languages in parallel
- Uses the `default` (English) row as the translation source for every key
- Masks HTML tags and entities (e.g. `<b>`, `&amp;`) before translation and restores them afterward
- Batches all strings per language into a single API call for efficiency
- Preserves untargeted language rows (e.g. `de`, `fr`) unchanged in the output
- Outputs a quoted CSV safe for Oracle Digital Assistant (ODA) import

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm

---

## Installation

```bash
npm install
```

---

## Usage

```bash
npm run translate -- <input-file.csv>
```

**Example:**

```bash
npm run translate -- file.csv
```

The output file is written to the same directory as the input, with `_translated` appended to the filename:

```
file.csv → file_translated.csv
```

---

## CSV Format

The input CSV must have the following columns:

| Column        | Description                                      |
|---------------|--------------------------------------------------|
| `languageTag` | Language identifier (`default`, `zh`, `tw`, `ko`, `de`, etc.) |
| `key`         | Unique message key                               |
| `message`     | The text content for that language and key       |

**Example input:**

```csv
languageTag,key,message
default,greeting,"Hello, <b>World</b>!"
zh,greeting,""
tw,greeting,""
ko,greeting,""
```

**Example output:**

```csv
languageTag,key,message
default,greeting,"Hello, <b>World</b>!"
zh,greeting,"你好，<b>世界</b>！"
tw,greeting,"你好，<b>世界</b>！"
ko,greeting,"안녕하세요, <b>世界</b>!"
```

---

## Target Languages

Configured in [index.ts](index.ts) via the `TARGET_LANGS` map:

```typescript
const TARGET_LANGS: Record<string, string> = {
    'zh': 'zh-CN',
    'tw': 'zh-TW',
    'ko': 'ko',
};
```

To add or remove languages, update this map. The key is the `languageTag` value in the CSV; the value is the Google Translate language code.

---

## How It Works

1. **Parse** — Reads the input CSV into structured row objects.
2. **Index defaults** — Builds a map of `key → message` from all `default` rows.
3. **Group tasks** — Collects all rows whose `languageTag` is in `TARGET_LANGS`, groups them by language.
4. **Mask HTML** — Replaces HTML tags and entities with numbered placeholders (e.g. `[[0]]`) to prevent the translation API from mangling them.
5. **Batch translate** — Sends all strings for each language as a single batched request to Google Translate, with all languages processed in parallel.
6. **Restore HTML** — Replaces placeholders back with their original HTML tags in each translated result.
7. **Write output** — Saves the updated records (with only targeted languages modified) as a quoted CSV.

---

## Project Structure

```
oda-resource-bundle-translator/
├── index.ts          # Main translation script
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
├── .gitignore        # Git ignore rules
├── file.csv          # Example input file
└── file_translated.csv  # Example output file
```

---

## Dependencies

| Package                | Purpose                              |
|------------------------|--------------------------------------|
| `csv-parse`            | Parse CSV input                      |
| `csv-stringify`        | Serialize records back to CSV        |
| `google-translate-api-x` | Google Translate API wrapper       |
| `ts-node`              | Run TypeScript directly              |
| `typescript`           | TypeScript compiler                  |
