#!/usr/bin/env node
/**
 * ConvertHub API - OCR Image to Text Conversion
 *
 * Extract text from images (PNG, JPG, TIFF, etc.) using OCR.
 * Supports multiple languages and outputs plain text.
 *
 * Usage:
 *   node ocr-image-to-text.js <input_image> [--language=eng] [--api-key=KEY]
 *
 * Examples:
 *   node ocr-image-to-text.js screenshot.png
 *   node ocr-image-to-text.js document.jpg --language=deu
 *   node ocr-image-to-text.js scan.tiff --language=eng+fra
 *
 * Supported input formats: png, jpg, jpeg, tiff, tif, bmp, gif, webp
 * Supported languages: eng, deu, fra, spa, ita, por, nld, rus, chi_sim, chi_tra, jpn, kor, ara, hin
 *
 * Get your API key at: https://converthub.com/api
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Load .env from parent directory
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length) {
            process.env[key.trim()] = valueParts.join('=').trim();
        }
    });
}

const API_BASE_URL = process.env.API_BASE_URL || 'https://api.converthub.com/v2';
const SUPPORTED_FORMATS = ['png', 'jpg', 'jpeg', 'tiff', 'tif', 'bmp', 'gif', 'webp'];

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1 || args[0] === '--help') {
    console.log('OCR Image to Text - ConvertHub API');
    console.log('===================================\n');
    console.log('Usage: node ocr-image-to-text.js <input_image> [--language=eng] [--api-key=KEY]\n');
    console.log('Examples:');
    console.log('  node ocr-image-to-text.js screenshot.png');
    console.log('  node ocr-image-to-text.js document.jpg --language=deu');
    console.log('  node ocr-image-to-text.js scan.tiff --language=eng+fra\n');
    console.log('Supported formats:', SUPPORTED_FORMATS.join(', '));
    console.log('Get your API key at: https://converthub.com/api');
    process.exit(1);
}

const inputFile = args[0];
let language = 'eng';
let apiKey = process.env.API_KEY;

args.forEach(arg => {
    if (arg.startsWith('--api-key=')) apiKey = arg.substring(10);
    if (arg.startsWith('--language=')) language = arg.substring(11);
});

if (!apiKey) {
    console.error('Error: API key required. Set API_KEY in .env or use --api-key parameter.');
    process.exit(1);
}

// Validate input file
if (!fs.existsSync(inputFile)) {
    console.error(`Error: File '${inputFile}' not found.`);
    process.exit(1);
}

const extension = path.extname(inputFile).toLowerCase().replace('.', '');
if (!SUPPORTED_FORMATS.includes(extension)) {
    console.error(`Error: Unsupported format '${extension}'. Supported: ${SUPPORTED_FORMATS.join(', ')}`);
    process.exit(1);
}

const fileSize = fs.statSync(inputFile).size;
const fileSizeMB = (fileSize / 1048576).toFixed(2);

if (fileSize > 52428800) {
    console.error(`Error: File size (${fileSizeMB} MB) exceeds 50MB limit.`);
    process.exit(1);
}

const client = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Authorization': `Bearer ${apiKey}` },
});

async function main() {
    console.log(`OCR: ${path.basename(inputFile)} (${fileSizeMB} MB) -> txt (language: ${language})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 1: Submit file for OCR conversion
    console.log('-> Uploading file...');

    const form = new FormData();
    form.append('file', fs.createReadStream(inputFile));
    form.append('target_format', 'txt');
    form.append('options[ocr]', 'true');
    form.append('options[ocr_language]', language);

    let response;
    try {
        response = await client.post('/convert', form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });
    } catch (error) {
        if (error.response) {
            const err = error.response.data.error || {};
            console.error(`\n✗ Error: ${err.message || 'Unknown error'}`);
            if (err.details) {
                Object.entries(err.details).forEach(([key, value]) => {
                    console.error(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
                });
            }
        } else {
            console.error(`\n✗ Failed to connect to API: ${error.message}`);
        }
        process.exit(1);
    }

    const result = response.data;

    // Check for cached result
    if (response.status === 200 && result.result?.download_url) {
        console.log('✓ OCR complete (cached result)\n');
        await downloadAndDisplay(result.result.download_url);
        return;
    }

    const jobId = result.job_id;
    console.log(`✓ Job created: ${jobId}\n`);

    // Step 2: Poll for job completion
    process.stdout.write('-> Processing OCR');

    let status = 'processing';
    let jobStatus = null;
    const maxAttempts = 150;

    for (let i = 0; i < maxAttempts && (status === 'processing' || status === 'queued'); i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        process.stdout.write('.');

        try {
            const statusResponse = await client.get(`/jobs/${jobId}`);
            jobStatus = statusResponse.data;
            status = jobStatus.status || 'unknown';
        } catch {
            // Continue polling on error
        }
    }

    console.log('\n');

    // Step 3: Handle result
    if (status === 'completed') {
        console.log('✓ OCR complete!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Processing time: ${jobStatus.processing_time || 'N/A'}`);
        console.log(`Download URL: ${jobStatus.result.download_url}`);
        console.log(`Expires: ${jobStatus.result.expires_at}\n`);

        await downloadAndDisplay(jobStatus.result.download_url);
    } else if (status === 'failed') {
        console.error('✗ OCR failed');
        console.error(`Error: ${jobStatus?.error?.message || 'Unknown error'}`);
        process.exit(1);
    } else {
        console.error('✗ Timeout: OCR is taking longer than expected');
        console.error(`Check status with: node ../job-management/check-status.js ${jobId}`);
        process.exit(1);
    }
}

async function downloadAndDisplay(downloadUrl) {
    const outputFile = path.join(
        path.dirname(inputFile),
        path.basename(inputFile, path.extname(inputFile)) + '.txt'
    );

    const response = await axios.get(downloadUrl, { responseType: 'stream' });
    const writer = fs.createWriteStream(outputFile);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });

    console.log(`Saved to: ${outputFile}\n`);

    // Display extracted text
    const text = fs.readFileSync(outputFile, 'utf8');
    if (text.trim()) {
        console.log('--- Extracted Text ---');
        console.log(text);
        console.log('--- End ---');
    } else {
        console.log('(No text was extracted - the image may not contain readable text)');
    }
}

main().catch(error => {
    console.error(`\n✗ Unexpected error: ${error.message}`);
    process.exit(1);
});
