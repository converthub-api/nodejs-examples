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

async function downloadResult(jobId, outputPath = null) {
    try {
        // First check job status to get download URL
        console.log(`Fetching download URL for job: ${jobId}`);
        
        const statusResponse = await axios.get(`${API_BASE_URL}/jobs/${jobId}`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
            }
        });

        const { status, result, error } = statusResponse.data;
        const download_url = result?.download_url;
        const output_format = result?.format;
        const file_size = result?.file_size;
        const file_name = statusResponse.data.metadata?.original_name;

        if (status !== 'completed') {
            console.error(`❌ Job ${jobId} is not completed yet`);
            console.log(`   Current status: ${status}`);
            if (error) {
                console.log(`   Error: ${error.message || error}`);
            }
            process.exit(1);
        }

        if (!download_url) {
            console.error(`❌ No download URL available for job ${jobId}`);
            console.log('   The file may have expired or been deleted');
            process.exit(1);
        }

        // Determine output path
        if (!outputPath) {
            const originalName = file_name || `converted_${jobId}`;
            const baseName = path.basename(originalName, path.extname(originalName));
            outputPath = path.join(__dirname, 'downloads', `${baseName}.${output_format}`);
        } else {
            outputPath = path.resolve(outputPath);
        }

        // Ensure download directory exists
        await fs.ensureDir(path.dirname(outputPath));

        console.log(`Downloading file...`);
        console.log(`   Job ID: ${jobId}`);
        console.log(`   Status: ${status}`);
        if (file_size) {
            console.log(`   Size: ${formatFileSize(file_size)}`);
        }
        console.log(`   Saving to: ${outputPath}`);

        // Download the file
        const downloadResponse = await axios.get(download_url, {
            responseType: 'stream',
            onDownloadProgress: (progressEvent) => {
                if (progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    process.stdout.write(`\rDownload progress: ${createProgressBar(percentCompleted)}`);
                }
            }
        });

        // Save to file
        const writer = fs.createWriteStream(outputPath);
        downloadResponse.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log('\n✅ Download completed successfully!');
                console.log(`   File saved to: ${outputPath}`);
                
                // Verify file size if available
                const stats = fs.statSync(outputPath);
                console.log(`   Downloaded size: ${formatFileSize(stats.size)}`);
                
                resolve(outputPath);
            });
            writer.on('error', (error) => {
                console.error('\n❌ Error writing file:', error.message);
                reject(error);
            });
        });

    } catch (error) {
        if (error.response?.status === 404) {
            console.error(`❌ Job not found: ${jobId}`);
        } else if (error.response?.status === 403) {
            console.error(`❌ Not authorized to access this job`);
        } else {
            console.error('Error:', error.response?.data || error.message);
        }
        process.exit(1);
    }
}

function createProgressBar(progress) {
    const width = 30;
    const filled = Math.floor((progress / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${bar} ${progress}%`;
}

function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Command line usage
if (process.argv.length < 3) {
    console.log('Usage: node download-result.js <job-id> [output-path]');
    console.log('');
    console.log('Examples:');
    console.log('  node download-result.js abc123');
    console.log('  node download-result.js abc123 ./output.pdf');
    console.log('  node download-result.js abc123 /home/user/downloads/converted.pdf');
    console.log('');
    console.log('If output path is not specified, file will be saved to ./downloads/');
    process.exit(1);
}

const jobId = process.argv[2];
const outputPath = process.argv[3] || null;

downloadResult(jobId, outputPath);