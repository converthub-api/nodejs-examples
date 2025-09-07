#!/usr/bin/env node

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs-extra';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import readline from 'readline';

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

async function uploadLargeFile(inputFile, targetFormat, options = {}) {
    try {
        // Validate file
        if (!await fs.pathExists(inputFile)) {
            console.error(`Error: File '${inputFile}' not found.`);
            process.exit(1);
        }

        const stats = await fs.stat(inputFile);
        const fileSize = stats.size;
        const fileSizeMB = (fileSize / 1048576).toFixed(2);
        const filename = path.basename(inputFile);

        // Check file size limit (2GB)
        if (fileSize > 2147483648) {
            console.error(`Error: File size (${fileSizeMB} MB) exceeds 2GB limit.`);
            process.exit(1);
        }

        // Determine chunk size (default 5MB)
        const chunkSizeMB = options['chunk-size'] || 5;
        const chunkSize = chunkSizeMB * 1048576;
        const totalChunks = Math.ceil(fileSize / chunkSize);

        console.log('Chunked Upload - ConvertHub API');
        console.log('================================');
        console.log(`File: ${filename} (${fileSizeMB} MB)`);
        console.log(`Target format: ${targetFormat}`);
        console.log(`Chunk size: ${chunkSizeMB} MB`);
        console.log(`Total chunks: ${totalChunks}`);
        console.log('━'.repeat(50) + '\n');

        // Step 1: Initialize chunked upload session
        console.log('→ Initializing upload session...');

        const initData = {
            filename: filename,
            file_size: fileSize,
            total_chunks: totalChunks,
            target_format: targetFormat
        };

        // Add optional webhook
        if (options.webhook) {
            initData.webhook_url = options.webhook;
        }

        // Add metadata
        initData.metadata = {
            original_size: fileSize,
            chunk_size: chunkSize,
            upload_time: new Date().toISOString()
        };

        const initResponse = await axios.post(`${API_BASE_URL}/upload/init`, initData, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const session = initResponse.data;
        const sessionId = session.session_id;
        const expiresAt = session.expires_at;

        console.log(`✓ Session created: ${sessionId}`);
        console.log(`  Expires at: ${expiresAt}\n`);

        // Step 2: Upload chunks
        console.log('→ Uploading chunks...\n');

        const fileHandle = await fsPromises.open(inputFile, 'r');
        const uploadedChunks = 0;
        const startTime = Date.now();

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            // Read chunk data
            const buffer = Buffer.alloc(chunkSize);
            const position = chunkIndex * chunkSize;
            const { bytesRead } = await fileHandle.read(buffer, 0, chunkSize, position);
            const chunkData = buffer.slice(0, bytesRead);

            // Upload chunk
            const progress = Math.round((chunkIndex + 1) / totalChunks * 100);
            process.stdout.write(`\rUploading chunk ${chunkIndex + 1}/${totalChunks} (${progress}%)...`);

            const formData = new FormData();
            formData.append('chunk', chunkData, {
                filename: 'chunk',
                contentType: 'application/octet-stream'
            });

            const uploadResponse = await axios.post(
                `${API_BASE_URL}/upload/${sessionId}/chunks/${chunkIndex}`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'Authorization': `Bearer ${API_KEY}`
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                }
            );

            if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
                console.log(`\n✗ Failed to upload chunk ${chunkIndex + 1}`);
                const error = uploadResponse.data;
                console.error(`Error: ${error.error?.message || 'Unknown error'}`);
                await fileHandle.close();
                process.exit(1);
            }

            // Calculate and display upload speed
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0) {
                const speed = ((chunkIndex + 1) * chunkSize) / elapsed / 1048576; // MB/s
                process.stdout.write(` [${speed.toFixed(1)} MB/s]`);
            }
        }

        await fileHandle.close();

        const uploadTime = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n✓ All chunks uploaded successfully in ${formatTime(uploadTime)}\n`);

        // Step 3: Complete upload and start conversion
        console.log('→ Finalizing upload and starting conversion...');

        const completeResponse = await axios.post(
            `${API_BASE_URL}/upload/${sessionId}/complete`,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            }
        );

        const job = completeResponse.data;
        const jobId = job.job_id;

        console.log('✓ Upload complete! Conversion started.');
        console.log(`  Job ID: ${jobId}\n`);

        // Step 4: Monitor conversion progress
        process.stdout.write('→ Converting');

        let attempts = 0;
        const maxAttempts = 180; // 6 minutes for large files
        let status = 'processing';
        let jobStatus;

        while ((status === 'processing' || status === 'queued' || status === 'pending') && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;
            process.stdout.write('.');

            const statusResponse = await axios.get(`${API_BASE_URL}/jobs/${jobId}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            jobStatus = statusResponse.data;
            status = jobStatus.status;
        }

        console.log('\n');

        // Step 5: Display results
        if (status === 'completed' && jobStatus.result?.download_url) {
            console.log('✓ Conversion complete!\n');
            console.log('━'.repeat(50));
            console.log('Results:');
            console.log(`  Download URL: ${jobStatus.result.download_url}`);
            console.log(`  Format: ${jobStatus.result.format}`);
            console.log(`  Size: ${formatFileSize(jobStatus.result.file_size)}`);
            console.log(`  Processing time: ${jobStatus.processing_time || 'N/A'}`);
            console.log(`  Total time: ${formatTime(Math.round((Date.now() - startTime) / 1000))}`);
            console.log(`  Expires: ${jobStatus.result.expires_at}`);

            // Offer to download
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const answer = await new Promise(resolve => {
                rl.question('\nDownload converted file? (y/n): ', resolve);
            });
            rl.close();

            if (answer.toLowerCase() === 'y') {
                await downloadLargeFile(jobStatus.result.download_url, targetFormat);
            }
        } else if (status === 'failed') {
            console.log('✗ Conversion failed');
            console.log(`Error: ${jobStatus.error?.message || 'Unknown error'}`);
            process.exit(1);
        } else {
            console.log('✗ Timeout: Conversion is taking longer than expected');
            console.log('Large files may take more time to process.');
            console.log(`Check status later with: node job-management/check-status.js ${jobId}`);
            
            if (options.webhook) {
                console.log('You will receive a webhook notification when complete.');
            }
            process.exit(1);
        }

    } catch (error) {
        if (error.response?.data?.error) {
            console.error(`✗ Error: ${error.response.data.error.message}`);
            if (error.response.data.error.code) {
                console.error(`  Code: ${error.response.data.error.code}`);
            }
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

async function downloadLargeFile(url, format) {
    const outputFile = `converted_${Date.now()}.${format}`;
    console.log(`Downloading to: ${outputFile}\n`);

    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            onDownloadProgress: (progressEvent) => {
                if (progressEvent.total) {
                    const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    const downloaded = formatFileSize(progressEvent.loaded);
                    const total = formatFileSize(progressEvent.total);
                    process.stdout.write(`\rDownloading: ${percent}% (${downloaded} / ${total})`);
                }
            }
        });

        const writer = fs.createWriteStream(path.join(__dirname, outputFile));
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log('\n');
        const stats = await fs.stat(path.join(__dirname, outputFile));
        console.log(`✓ File saved: ${outputFile} (${formatFileSize(stats.size)})`);
    } catch (error) {
        console.log('\n✗ Download failed');
        throw error;
    }
}

function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return size.toFixed(2) + ' ' + units[i];
}

function formatTime(seconds) {
    if (seconds < 60) {
        return seconds + ' seconds';
    } else if (seconds < 3600) {
        return (seconds / 60).toFixed(1) + ' minutes';
    } else {
        return (seconds / 3600).toFixed(1) + ' hours';
    }
}

// Command line usage
if (process.argv.length < 4) {
    console.log('Chunked Upload - ConvertHub API');
    console.log('================================\n');
    console.log('Upload and convert large files (up to 2GB) in chunks.\n');
    console.log('Usage: node upload-large-file.js <input_file> <target_format> [options]\n');
    console.log('Options:');
    console.log('  --chunk-size=MB    Chunk size in megabytes (default: 5MB)');
    console.log('  --api-key=KEY      Your API key');
    console.log('  --webhook=URL      Webhook URL for notifications\n');
    console.log('Examples:');
    console.log('  node upload-large-file.js video.mov mp4');
    console.log('  node upload-large-file.js large.pdf docx --chunk-size=10\n');
    console.log('Get your API key at: https://converthub.com/api');
    process.exit(1);
}

const inputFile = path.resolve(process.argv[2]);
const targetFormat = process.argv[3].toLowerCase();

// Parse options
const options = {};
for (let i = 4; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) {
        options[match[1]] = match[2];
    }
}

// Override API key if provided in command line
if (options['api-key']) {
    process.env.API_KEY = options['api-key'];
}

uploadLargeFile(inputFile, targetFormat, options);