#!/usr/bin/env node

import axios from 'axios';
import FormData from 'form-data';
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
    console.error('Get your API key at: https://converthub.com/api');
    process.exit(1);
}

async function convertFile(inputFile, targetFormat) {
    try {
        // Validate input file
        if (!await fs.pathExists(inputFile)) {
            console.error(`Error: File '${inputFile}' not found.`);
            process.exit(1);
        }

        const stats = await fs.stat(inputFile);
        const fileSize = stats.size;
        const fileSizeMB = (fileSize / 1048576).toFixed(2);

        if (fileSize > 52428800) { // 50MB
            console.error(`Error: File size (${fileSizeMB} MB) exceeds 50MB limit.`);
            console.error('Use chunked-upload/upload-large-file.js for files larger than 50MB.');
            process.exit(1);
        }

        console.log(`Converting: ${path.basename(inputFile)} (${fileSizeMB} MB) to ${targetFormat}`);
        console.log('━'.repeat(50) + '\n');

        // Step 1: Submit file for conversion
        console.log('→ Uploading file...');

        const formData = new FormData();
        formData.append('file', fs.createReadStream(inputFile));
        formData.append('target_format', targetFormat);

        const response = await axios.post(`${API_BASE_URL}/convert`, formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${API_KEY}`,
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        const result = response.data;

        // Check for cached result (instant conversion)
        if (response.status === 200 && result.result?.download_url) {
            console.log('✓ Conversion complete (cached result)\n');
            console.log(`Download URL: ${result.result.download_url}`);
            if (result.result.file_size) {
                console.log(`Size: ${(result.result.file_size / 1048576).toFixed(2)} MB`);
            }
            if (result.result.expires_at) {
                console.log(`Expires: ${result.result.expires_at}`);
            }
            process.exit(0);
        }

        const jobId = result.job_id;
        console.log(`✓ Job created: ${jobId}\n`);

        // Step 2: Monitor conversion progress
        process.stdout.write('→ Converting');

        let attempts = 0;
        const maxAttempts = 150; // 5 minutes max with 2 second intervals
        let status = 'processing';

        while ((status === 'processing' || status === 'queued' || status === 'pending') && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            attempts++;
            process.stdout.write('.');

            const statusResponse = await axios.get(`${API_BASE_URL}/jobs/${jobId}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                }
            });

            const jobData = statusResponse.data;
            status = jobData.status;

            if (status === 'completed' && jobData.result?.download_url) {
                console.log('\n✓ Conversion complete!\n');
                console.log(`Download URL: ${jobData.result.download_url}`);
                if (jobData.result.file_size) {
                    console.log(`Size: ${(jobData.result.file_size / 1048576).toFixed(2)} MB`);
                }
                if (jobData.processing_time) {
                    console.log(`Processing time: ${jobData.processing_time} seconds`);
                }
                if (jobData.result.expires_at) {
                    console.log(`Expires: ${jobData.result.expires_at}`);
                }
                
                // Optionally download the file
                const outputFile = `${path.basename(inputFile, path.extname(inputFile))}.${targetFormat}`;
                const outputPath = path.join(__dirname, outputFile);
                
                console.log(`\n→ Downloading to ${outputPath}...`);
                
                const downloadResponse = await axios.get(jobData.result.download_url, {
                    responseType: 'stream'
                });

                const writer = fs.createWriteStream(outputPath);
                downloadResponse.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                console.log('✓ File downloaded successfully!\n');
                console.log('═'.repeat(50));
                console.log('Conversion successful!');
                console.log('═'.repeat(50));
                process.exit(0);
            }

            if (status === 'failed') {
                console.log('\n✗ Conversion failed!');
                if (jobData.error) {
                    console.error(`Error: ${jobData.error.message || jobData.error}`);
                }
                process.exit(1);
            }
        }

        if (attempts >= maxAttempts) {
            console.log('\n✗ Conversion timeout - took longer than 5 minutes');
            process.exit(1);
        }

    } catch (error) {
        if (error.response?.data?.error) {
            console.error(`✗ Error: ${error.response.data.error.message}`);
            if (error.response.data.error.details) {
                Object.entries(error.response.data.error.details).forEach(([key, value]) => {
                    console.error(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
                });
            }
        } else {
            console.error(`✗ Error: ${error.message}`);
        }
        process.exit(1);
    }
}

// Command line usage
if (process.argv.length < 4) {
    console.log('Usage: node convert.js <input-file> <target-format>');
    console.log('');
    console.log('Examples:');
    console.log('  node convert.js document.pdf docx');
    console.log('  node convert.js image.png jpg');
    console.log('  node convert.js presentation.pptx pdf');
    console.log('');
    console.log('Note: For files larger than 50MB, use chunked-upload/upload-large-file.js');
    process.exit(1);
}

const inputFile = path.resolve(process.argv[2]);
const targetFormat = process.argv[3];

convertFile(inputFile, targetFormat);