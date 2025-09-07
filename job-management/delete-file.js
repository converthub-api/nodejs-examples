#!/usr/bin/env node

import axios from 'axios';
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

async function deleteFile(jobId) {
    try {
        console.log(`Attempting to delete file for job: ${jobId}`);

        const response = await axios.delete(`${API_BASE_URL}/jobs/${jobId}/destroy`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
            }
        });

        const data = response.data;

        if (data.success) {
            console.log(`✅ File deleted successfully for job: ${jobId}`);
            
            if (data.message) {
                console.log(`   ${data.message}`);
            }
            
            if (data.deleted_at) {
                console.log(`   Deleted at: ${new Date(data.deleted_at).toLocaleString()}`);
            }
        } else {
            console.log(`⚠️ Could not delete file for job ${jobId}`);
            if (data.message) {
                console.log(`   Reason: ${data.message}`);
            }
        }

        return data;

    } catch (error) {
        if (error.response?.status === 404) {
            console.error(`❌ Job not found: ${jobId}`);
        } else if (error.response?.status === 400) {
            const message = error.response.data?.message || error.response.data?.error;
            console.error(`❌ Cannot delete file: ${message}`);
        } else if (error.response?.status === 403) {
            console.error(`❌ Not authorized to delete this file`);
        } else {
            console.error('Error:', error.response?.data || error.message);
        }
        process.exit(1);
    }
}

// Command line usage
if (process.argv.length < 3) {
    console.log('Usage: node delete-file.js <job-id>');
    console.log('Example: node delete-file.js abc123');
    console.log('\nNote: This permanently deletes the converted file from storage');
    process.exit(1);
}

const jobId = process.argv[2];
deleteFile(jobId);