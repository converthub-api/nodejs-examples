#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs-extra';
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

// Parse command line options
function parseOptions(args) {
    const options = {};
    const jobId = args[2];
    
    for (let i = 3; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            if (arg.includes('=')) {
                const [key, value] = arg.substring(2).split('=');
                options[key] = value;
            } else {
                options[arg.substring(2)] = true;
            }
        }
    }
    
    return { jobId, options };
}

// Check job status
async function checkStatus(jobId, apiKey, autoDownload = false) {
    console.log('Job Status - ConvertHub API');
    console.log('===========================\n');
    console.log(`Job ID: ${jobId}`);
    console.log('━'.repeat(50) + '\n');
    
    try {
        const response = await axios.get(`${API_BASE_URL}/jobs/${jobId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        const job = response.data;
        const status = job.status;
        
        // Display status with appropriate icon
        const statusIcon = getStatusIcon(status);
        console.log(`Status: ${statusIcon} ${status.charAt(0).toUpperCase() + status.slice(1)}\n`);
        
        // Display job details
        if (job.source_format) {
            console.log(`Conversion: ${job.source_format.toUpperCase()} → ${job.target_format.toUpperCase()}`);
        }
        
        if (job.created_at) {
            console.log(`Created: ${job.created_at}`);
        }
        
        // Display metadata if present
        if (job.metadata && Object.keys(job.metadata).length > 0) {
            console.log('\nMetadata:');
            for (const [key, value] of Object.entries(job.metadata)) {
                console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
            }
        }
        
        // Handle different statuses
        switch (status) {
            case 'completed':
                console.log('\n✓ Conversion complete!');
                console.log('━'.repeat(50) + '\n');
                
                if (job.processing_time) {
                    console.log(`Processing time: ${job.processing_time}`);
                }
                
                console.log(`Download URL: ${job.result.download_url}`);
                console.log(`Format: ${job.result.format}`);
                console.log(`Size: ${formatFileSize(job.result.file_size)}`);
                console.log(`Expires: ${job.result.expires_at}`);
                
                if (autoDownload) {
                    console.log('\nDownloading file...');
                    await downloadFile(job.result.download_url, job.result.format);
                } else {
                    console.log(`\nTo download: node check-status.js ${jobId} --download`);
                }
                break;
                
            case 'processing':
            case 'queued':
            case 'pending':
                console.log('\n⏳ Conversion in progress...');
                console.log(`To monitor: node check-status.js ${jobId} --watch`);
                console.log(`To cancel: node check-status.js ${jobId} --cancel`);
                break;
                
            case 'failed':
                console.log('\n✗ Conversion failed');
                if (job.error) {
                    console.log(`Error: ${job.error.message}`);
                    if (job.error.code) {
                        console.log(`Code: ${job.error.code}`);
                    }
                }
                break;
                
            case 'cancelled':
                console.log('\n⚠️ Job was cancelled');
                break;
        }
        
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('✗ Job not found');
            console.log('  The job ID may be incorrect or the job has expired.');
        } else {
            console.error(`✗ Error: ${error.response?.data?.error?.message || 'Failed to get status'}`);
        }
        process.exit(1);
    }
}

// Watch job until completion
async function watchJob(jobId, apiKey, autoDownload = false) {
    console.log(`Monitoring Job: ${jobId}`);
    console.log('━'.repeat(50));
    console.log('Press Ctrl+C to stop monitoring\n');
    
    let previousStatus = null;
    let attempts = 0;
    
    while (true) {
        try {
            const response = await axios.get(`${API_BASE_URL}/jobs/${jobId}`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });
            
            const job = response.data;
            const status = job.status;
            
            // Update display if status changed
            if (status !== previousStatus) {
                const timestamp = new Date().toLocaleTimeString();
                const icon = getStatusIcon(status);
                console.log(`[${timestamp}] Status: ${icon} ${status.charAt(0).toUpperCase() + status.slice(1)}`);
                previousStatus = status;
            } else {
                process.stdout.write('.');
            }
            
            // Check if job is complete
            if (['completed', 'failed', 'cancelled'].includes(status)) {
                console.log('\n');
                
                if (status === 'completed') {
                    console.log('✓ Conversion complete!');
                    console.log(`Download URL: ${job.result.download_url}`);
                    console.log(`Size: ${formatFileSize(job.result.file_size)}`);
                    
                    if (autoDownload) {
                        console.log('\nDownloading file...');
                        await downloadFile(job.result.download_url, job.result.format);
                    }
                } else if (status === 'failed') {
                    console.log('✗ Conversion failed');
                    if (job.error) {
                        console.log(`Error: ${job.error.message}`);
                    }
                } else {
                    console.log('⚠️ Job was cancelled');
                }
                
                break;
            }
            
            attempts++;
            if (attempts > 600) { // 20 minutes max
                console.log('\n\n⏱️ Timeout: Job is taking too long');
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.log('\n✗ Failed to get status');
            process.exit(1);
        }
    }
}

// Cancel a running job
async function cancelJob(jobId, apiKey) {
    console.log(`Cancelling job: ${jobId}`);
    
    try {
        const response = await axios.delete(`${API_BASE_URL}/jobs/${jobId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        console.log('✓ Job cancelled successfully');
    } catch (error) {
        console.log('✗ Failed to cancel job');
        console.log(`Error: ${error.response?.data?.error?.message || 'Unknown error'}`);
    }
}

// Delete completed file
async function deleteFile(jobId, apiKey) {
    console.log(`Deleting file for job: ${jobId}`);
    console.log('Warning: This action is irreversible!\n');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
        rl.question('Continue? (yes/no): ', resolve);
    });
    rl.close();
    
    if (answer.toLowerCase() !== 'yes') {
        console.log('Cancelled.');
        process.exit(0);
    }
    
    try {
        const response = await axios.delete(`${API_BASE_URL}/jobs/${jobId}/destroy`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        console.log('✓ File deleted successfully');
        if (response.data.deleted_at) {
            console.log(`Deleted at: ${response.data.deleted_at}`);
        }
    } catch (error) {
        console.log('✗ Failed to delete file');
        console.log(`Error: ${error.response?.data?.error?.message || 'Unknown error'}`);
        
        if (error.response?.data?.error?.code === 'JOB_NOT_COMPLETED') {
            console.log('Note: Only completed conversions can be deleted.');
        }
    }
}

// Download file
async function downloadFile(url, format) {
    const outputFile = `downloaded_${Date.now()}.${format}`;
    
    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            onDownloadProgress: (progressEvent) => {
                if (progressEvent.total) {
                    const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    process.stdout.write(`\rDownloading: ${percent}%`);
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
    }
}

// Get status icon
function getStatusIcon(status) {
    const icons = {
        'queued': '⏳',
        'pending': '⏳',
        'processing': '🔄',
        'completed': '✅',
        'failed': '❌',
        'cancelled': '⚠️'
    };
    
    return icons[status] || '❓';
}

// Format file size
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

// Main execution
if (process.argv.length < 3) {
    console.log('Job Management - ConvertHub API');
    console.log('================================\n');
    console.log('Usage: node check-status.js <job_id> [options]\n');
    console.log('Options:');
    console.log('  --download     Download file if conversion is complete');
    console.log('  --cancel       Cancel a running job');
    console.log('  --delete       Delete completed file from storage');
    console.log('  --watch        Monitor job until completion');
    console.log('  --api-key=KEY  Your API key\n');
    console.log('Examples:');
    console.log('  node check-status.js job_123e4567-e89b-12d3');
    console.log('  node check-status.js job_123e4567-e89b-12d3 --download');
    console.log('  node check-status.js job_123e4567-e89b-12d3 --watch\n');
    console.log('Get your API key at: https://converthub.com/api');
    process.exit(1);
}

const { jobId, options } = parseOptions(process.argv);

// Override API key if provided
const apiKey = options['api-key'] || API_KEY;

// Execute requested action
if (options.cancel) {
    cancelJob(jobId, apiKey);
} else if (options.delete) {
    deleteFile(jobId, apiKey);
} else if (options.watch) {
    watchJob(jobId, apiKey, options.download);
} else {
    checkStatus(jobId, apiKey, options.download);
}