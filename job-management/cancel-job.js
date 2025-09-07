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

async function cancelJob(jobId) {
    try {
        console.log(`Attempting to cancel job: ${jobId}`);

        const response = await axios.delete(`${API_BASE_URL}/jobs/${jobId}`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const data = response.data;

        if (data.success) {
            console.log(`✅ Job ${jobId} has been cancelled successfully`);
            
            if (data.job) {
                console.log('\nJob details:');
                console.log(`  Status: ${data.job.status}`);
                console.log(`  Original format: ${data.job.input_format} → ${data.job.output_format}`);
                console.log(`  Cancelled at: ${new Date(data.job.cancelled_at || data.job.updated_at).toLocaleString()}`);
            }
        } else {
            console.log(`⚠️ Could not cancel job ${jobId}`);
            if (data.message) {
                console.log(`Reason: ${data.message}`);
            }
        }

        return data;

    } catch (error) {
        if (error.response?.status === 404) {
            console.error(`❌ Job not found: ${jobId}`);
        } else if (error.response?.status === 400) {
            const message = error.response.data?.message || error.response.data?.error;
            console.error(`❌ Cannot cancel job: ${message}`);
            console.log('Note: Only pending or processing jobs can be cancelled');
        } else {
            console.error('Error:', error.response?.data || error.message);
        }
        process.exit(1);
    }
}

// Command line usage
if (process.argv.length < 3) {
    console.log('Usage: node cancel-job.js <job-id>');
    console.log('Example: node cancel-job.js abc123');
    console.log('\nNote: Only jobs with status "pending" or "processing" can be cancelled');
    process.exit(1);
}

const jobId = process.argv[2];
cancelJob(jobId);