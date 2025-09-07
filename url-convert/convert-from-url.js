#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API_BASE_URL = process.env.API_BASE_URL || 'https://api.converthub.com/v2';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    console.error('Error: API_KEY is not set in .env file');
    process.exit(1);
}

async function convertFromUrl(fileUrl, targetFormat) {
    try {
        console.log('ConvertHub URL Conversion');
        console.log('=========================\n');

        const filename = fileUrl.split('/').pop().split('?')[0] || 'converted';

        console.log(`Target format: ${targetFormat.toUpperCase()}`);
        console.log(`Source URL: ${fileUrl}`);
        console.log('━'.repeat(50) + '\n');

        // Step 1: Submit URL for conversion
        console.log('→ Submitting URL for conversion...');

        const data = {
            file_url: fileUrl,
            target_format: targetFormat,
            output_filename: `${path.parse(filename).name}.${targetFormat}`
        };

        const response = await axios.post(`${API_BASE_URL}/convert-url`, data, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const result = response.data;

        // Check for cached result
        if (response.status === 200 && result.result?.download_url) {
            console.log('✓ Conversion complete (cached result)\n');
            await downloadFile(result.result.download_url, targetFormat, filename);
            return;
        }

        // Get job ID for polling
        const jobId = result.job_id;
        if (!jobId) {
            throw new Error('No job ID returned from API');
        }

        console.log(`✓ Job created: ${jobId}\n`);

        // Step 2: Poll for completion
        console.log('→ Waiting for conversion to complete...');

        let attempts = 0;
        const maxAttempts = 300; // 10 minutes with 2 second intervals

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

            const statusResponse = await axios.get(`${API_BASE_URL}/jobs/${jobId}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            const jobData = statusResponse.data;

            process.stdout.write(`\r  Status: ${jobData.status}...`);

            if (jobData.status === 'completed' && jobData.result?.download_url) {
                console.log('\n✓ Conversion complete!\n');
                await downloadFile(jobData.result.download_url, targetFormat, filename);
                return;
            }

            if (jobData.status === 'failed') {
                const errorMsg = jobData.error?.message || 'Conversion failed';
                throw new Error(errorMsg);
            }

            attempts++;
        }

        throw new Error('Conversion timeout - job took too long');

    } catch (error) {
        if (error.response?.data?.error) {
            console.error(`\n✗ Error: ${error.response.data.error.message}`);
            if (error.response.data.error.code) {
                console.error(`  Code: ${error.response.data.error.code}`);
            }
            if (error.response.data.error.details) {
                Object.entries(error.response.data.error.details).forEach(([key, value]) => {
                    console.error(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
                });
            }
        } else {
            console.error(`\n✗ Error: ${error.message}`);
        }
        process.exit(1);
    }
}

async function downloadFile(downloadUrl, targetFormat, originalFilename) {
    const outputFilename = `${path.parse(originalFilename).name}.${targetFormat}`;
    const outputPath = path.join(__dirname, outputFilename);

    console.log('→ Downloading converted file...');

    const response = await axios.get(downloadUrl, {
        responseType: 'stream'
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            const stats = fs.statSync(outputPath);
            console.log(`✓ File saved: ${outputPath}`);
            console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB\n`);

            console.log('═'.repeat(50));
            console.log('Conversion successful!');
            console.log('═'.repeat(50));
            resolve(outputPath);
        });
        writer.on('error', reject);
    });
}

// Command line usage
if (process.argv.length < 4) {
    console.log('Usage: node convert-from-url.js <url> <target-format>');
    console.log('');
    console.log('Examples:');
    console.log('  node convert-from-url.js https://example.com/document.pdf docx');
    console.log('  node convert-from-url.js https://example.com/image.png jpg');
    process.exit(1);
}

const fileUrl = process.argv[2];
const targetFormat = process.argv[3];

// Validate URL
try {
    new URL(fileUrl);
} catch (e) {
    console.error('Error: Invalid URL provided');
    process.exit(1);
}

convertFromUrl(fileUrl, targetFormat);
