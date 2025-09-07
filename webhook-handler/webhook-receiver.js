#!/usr/bin/env node

/**
 * ConvertHub API - Webhook Receiver
 * 
 * This script handles webhook notifications from ConvertHub API.
 * Deploy this on your server and use the URL as webhook_url when converting files.
 * 
 * Example webhook URL:
 *   https://your-server.com:3000/webhook
 * 
 * The ConvertHub API will POST to this URL when conversion completes.
 */

import express from 'express';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const PORT = process.env.WEBHOOK_PORT || 3000;
const AUTO_DOWNLOAD = process.env.AUTO_DOWNLOAD === 'true';
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// Log file for webhook events
const logFile = path.join(__dirname, 'webhook_events.log');

// Initialize Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
    // Get the raw POST data
    const data = req.body;
    
    // Log the webhook event
    logEvent(logFile, data);
    
    // Validate webhook data
    if (!data || !data.event) {
        res.status(400).json({ error: 'Invalid webhook payload' });
        return;
    }
    
    // Process webhook based on event type
    switch (data.event) {
        case 'conversion.completed':
            await handleConversionCompleted(data);
            break;
            
        case 'conversion.failed':
            handleConversionFailed(data);
            break;
            
        default:
            logEvent(logFile, { warning: `Unknown event type: ${data.event}` });
    }
    
    // Always return 200 OK to acknowledge receipt
    res.status(200).json({ status: 'received' });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Info endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'ConvertHub Webhook Receiver',
        webhook_endpoint: '/webhook',
        health_endpoint: '/health',
        port: PORT
    });
});

/**
 * Handle successful conversion
 */
async function handleConversionCompleted(data) {
    const jobId = data.job_id;
    const downloadUrl = data.result?.download_url;
    const format = data.result?.format;
    const fileSize = data.result?.file_size;
    const expiresAt = data.result?.expires_at;
    
    // Log success
    logEvent(logFile, {
        event: 'conversion.completed',
        job_id: jobId,
        format: format,
        size: formatFileSize(fileSize),
        expires: expiresAt
    });
    
    // Process metadata if present
    if (data.metadata && Object.keys(data.metadata).length > 0) {
        processMetadata(data.metadata, jobId);
    }
    
    // Optional: Download the file automatically
    if (AUTO_DOWNLOAD && downloadUrl) {
        await downloadFile(downloadUrl, jobId, format);
    }
    
    // Optional: Send notification email
    if (NOTIFICATION_EMAIL) {
        // Note: In Node.js, you'd typically use a service like SendGrid or Nodemailer
        console.log(`Would send email to ${NOTIFICATION_EMAIL} for job ${jobId}`);
    }
    
    // Optional: Update database
    // Implement your database update logic here
}

/**
 * Handle failed conversion
 */
function handleConversionFailed(data) {
    const jobId = data.job_id;
    const error = data.error || { message: 'Unknown error' };
    
    // Log failure
    logEvent(logFile, {
        event: 'conversion.failed',
        job_id: jobId,
        error: error.message,
        code: error.code || 'UNKNOWN'
    });
    
    // Process metadata to identify the user/request
    if (data.metadata && Object.keys(data.metadata).length > 0) {
        const metadata = data.metadata;
        
        // Notify user about failure
        if (metadata.user_email) {
            console.log(`Would send failure notification to ${metadata.user_email} for job ${jobId}`);
        }
        
        // Update database
        if (metadata.request_id) {
            // Implement your database update logic here
            console.log(`Would update database for request ${metadata.request_id}`);
        }
    }
    
    // Optional: Alert admin for critical failures
    if (error.code === 'SYSTEM_ERROR' && ADMIN_EMAIL) {
        console.log(`Would alert admin at ${ADMIN_EMAIL} about critical error for job ${jobId}`);
    }
}

/**
 * Process custom metadata
 */
function processMetadata(metadata, jobId) {
    // Example: Update your application based on metadata
    if (metadata.user_id) {
        // Update user's conversion history
        logEvent(logFile, {
            action: 'update_user_history',
            user_id: metadata.user_id,
            job_id: jobId
        });
    }
    
    if (metadata.order_id) {
        // Mark order as processed
        logEvent(logFile, {
            action: 'update_order',
            order_id: metadata.order_id,
            job_id: jobId
        });
    }
    
    // Add your custom metadata processing here
}

/**
 * Download converted file automatically
 */
async function downloadFile(url, jobId, format) {
    const downloadDir = path.join(__dirname, 'downloads');
    await fs.ensureDir(downloadDir);
    
    const filename = path.join(downloadDir, `${jobId}.${format}`);
    
    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            timeout: 300000 // 5 minutes timeout
        });
        
        const writer = fs.createWriteStream(filename);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        const stats = await fs.stat(filename);
        logEvent(logFile, {
            action: 'file_downloaded',
            job_id: jobId,
            path: filename,
            size: formatFileSize(stats.size)
        });
        
    } catch (error) {
        if (await fs.pathExists(filename)) {
            await fs.unlink(filename);
        }
        logEvent(logFile, {
            error: 'download_failed',
            job_id: jobId,
            message: error.message
        });
    }
}

/**
 * Log webhook events
 */
function logEvent(logFile, data) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp: timestamp,
        data: data
    };
    
    fs.appendFileSync(
        logFile,
        JSON.stringify(logEntry) + '\n',
        { flag: 'a' }
    );
    
    // Also log to console
    console.log(`[${timestamp}] ${JSON.stringify(data)}`);
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return size.toFixed(2) + ' ' + units[i];
}

// Start the server
app.listen(PORT, () => {
    console.log('ConvertHub Webhook Receiver');
    console.log('============================');
    console.log(`Server listening on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log('');
    console.log('For public access, use ngrok or similar:');
    console.log(`  ngrok http ${PORT}`);
    console.log('');
    console.log('Use the public URL as webhook_url when converting files.');
    console.log('Webhook events will be logged to:', logFile);
});