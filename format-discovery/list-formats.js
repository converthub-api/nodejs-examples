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

class FormatDiscovery {
    constructor() {
        this.axiosConfig = {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        };
    }

    async getAllFormats() {
        try {
            const response = await axios.get(`${API_BASE_URL}/formats`, this.axiosConfig);
            return response.data;
        } catch (error) {
            console.error('Error fetching formats:', error.response?.data || error.message);
            return null;
        }
    }

    async getConversionsForFormat(format) {
        try {
            const response = await axios.get(`${API_BASE_URL}/formats/${format}/conversions`, this.axiosConfig);
            return response.data;
        } catch (error) {
            console.error(`Error fetching conversions for ${format}:`, error.response?.data || error.message);
            return null;
        }
    }

    async checkConversion(fromFormat, toFormat) {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/formats/${fromFormat}/to/${toFormat}`,
                this.axiosConfig
            );
            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                return { supported: false };
            }
            console.error('Error checking conversion:', error.response?.data || error.message);
            return null;
        }
    }

    displayFormats(data, category = null) {
        if (!data || !data.success) {
            console.log('No formats available');
            return;
        }

        console.log(`Total supported formats: ${data.total_formats}`);
        console.log('─'.repeat(50));

        // V2 API returns formats grouped by type:
        // { "document": [{extension: "pdf", mime_type: "..."}], "image": [...] }
        const formats = data.formats;
        
        // If category filter specified, only show that category
        const categoriesToShow = category ? [category.toLowerCase()] : Object.keys(formats).sort();
        
        categoriesToShow.forEach(cat => {
            if (formats[cat]) {
                console.log(`\n${cat.charAt(0).toUpperCase() + cat.slice(1)}:`);
                const extensions = formats[cat].map(f => f.extension.toUpperCase()).join(', ');
                console.log('  ' + extensions);
            }
        });
        
        if (category && !formats[category.toLowerCase()]) {
            console.log(`\nNo formats found in category: ${category}`);
        }
    }

    displayConversions(data) {
        if (!data) return;

        console.log(`\nConversions from ${data.source_format?.toUpperCase() || 'Unknown'}`);
        console.log('===================\n');
        
        console.log(`Source format: ${data.source_format?.toUpperCase() || 'N/A'}`);
        console.log(`MIME type: ${data.mime_type || 'N/A'}`);
        console.log(`Category: ${data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1) : 'N/A'}`);
        console.log(`Total conversions: ${data.total_conversions || 0}`);
        console.log('━'.repeat(50));
        
        if (data.available_conversions && data.available_conversions.length > 0) {
            console.log('\nAvailable target formats:\n');
            
            // Group by type/category for better readability
            const byCategory = {};
            data.available_conversions.forEach(conv => {
                const type = this.getFormatType(conv.target_format);
                if (!byCategory[type]) byCategory[type] = [];
                byCategory[type].push(conv);
            });

            Object.keys(byCategory).sort().forEach(type => {
                console.log(`  ${type.charAt(0).toUpperCase() + type.slice(1)}:`);
                const formats = byCategory[type].map(c => c.target_format.toUpperCase()).join(', ');
                console.log(`    ${formats}\n`);
            });
        } else {
            console.log('\nNo conversions available for this format');
        }
    }

    getFormatType(format) {
        const types = {
            // Documents
            'pdf': 'document', 'docx': 'document', 'doc': 'document', 'odt': 'document',
            'rtf': 'document', 'txt': 'document', 'html': 'document', 'tex': 'document',
            // Images
            'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image',
            'svg': 'image', 'bmp': 'image', 'tiff': 'image', 'ico': 'image', 'heic': 'image',
            // Videos
            'mp4': 'video', 'avi': 'video', 'mov': 'video', 'webm': 'video', 'mkv': 'video',
            'flv': 'video', 'wmv': 'video', 'mpeg': 'video',
            // Audio
            'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'aac': 'audio', 'flac': 'audio',
            'm4a': 'audio', 'wma': 'audio',
            // Spreadsheets
            'xlsx': 'spreadsheet', 'xls': 'spreadsheet', 'ods': 'spreadsheet', 'csv': 'spreadsheet',
            // Presentations
            'pptx': 'presentation', 'ppt': 'presentation', 'odp': 'presentation',
            // Ebooks
            'epub': 'ebook', 'mobi': 'ebook', 'azw': 'ebook', 'azw3': 'ebook'
        };
        return types[format.toLowerCase()] || 'other';
    }

    displayConversionCheck(result, fromFormat, toFormat) {
        if (!result) return;

        console.log(`\nConversion: ${fromFormat} → ${toFormat}`);
        console.log('─'.repeat(50));

        if (result.supported) {
            console.log('✅ Conversion is supported');
            if (result.service) {
                console.log(`Service: ${result.service}`);
            }
            if (result.estimated_time) {
                console.log(`Estimated time: ${result.estimated_time}`);
            }
            if (result.max_file_size) {
                console.log(`Max file size: ${this.formatFileSize(result.max_file_size)}`);
            }
            if (result.options && result.options.length > 0) {
                console.log('\nAvailable options:');
                result.options.forEach(opt => {
                    console.log(`  - ${opt.name}: ${opt.description}`);
                    if (opt.values) {
                        console.log(`    Values: ${opt.values.join(', ')}`);
                    }
                });
            }
        } else {
            console.log('❌ Conversion is not supported');
            if (result.alternatives && result.alternatives.length > 0) {
                console.log('\nAlternative conversions:');
                result.alternatives.forEach(alt => {
                    console.log(`  - ${fromFormat} → ${alt.format} → ${toFormat}`);
                });
            }
        }
    }

    formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    async run(command, args) {
        switch(command) {
            case 'list':
            case 'all':
                const data = await this.getAllFormats();
                if (data) {
                    this.displayFormats(data, args[0]);
                }
                break;

            case 'conversions':
            case 'from':
                if (!args[0]) {
                    console.error('Error: Please specify a format');
                    console.log('Usage: node list-formats.js conversions <format>');
                    return;
                }
                const conversions = await this.getConversionsForFormat(args[0]);
                this.displayConversions(conversions);
                break;

            case 'check':
                if (!args[0] || !args[1]) {
                    console.error('Error: Please specify both source and target formats');
                    console.log('Usage: node list-formats.js check <from-format> <to-format>');
                    return;
                }
                const checkResult = await this.checkConversion(args[0], args[1]);
                this.displayConversionCheck(checkResult, args[0], args[1]);
                break;

            case 'categories':
                const allData = await this.getAllFormats();
                if (allData && allData.formats) {
                    console.log('\nAvailable categories:');
                    console.log('─'.repeat(50));
                    Object.keys(allData.formats).sort().forEach(cat => {
                        const count = allData.formats[cat].length;
                        console.log(`  ${(cat.charAt(0).toUpperCase() + cat.slice(1)).padEnd(20)} (${count} formats)`);
                    });
                }
                break;

            default:
                this.showHelp();
        }
    }

    showHelp() {
        console.log(`
ConvertHub Format Discovery Tool

Usage: node list-formats.js <command> [options]

Commands:
  list [category]           List all supported formats (optionally filtered by category)
  conversions <format>      Show all possible conversions from a specific format
  check <from> <to>        Check if a specific conversion is supported
  categories               List all format categories

Examples:
  node list-formats.js list                    # List all formats
  node list-formats.js list document          # List only document formats
  node list-formats.js conversions pdf        # Show what PDF can be converted to
  node list-formats.js check docx pdf        # Check if DOCX to PDF is supported
  node list-formats.js categories            # Show all categories
        `);
    }
}

// Command line usage
const discovery = new FormatDiscovery();
const command = process.argv[2];
const args = process.argv.slice(3);

if (!command) {
    discovery.showHelp();
} else {
    discovery.run(command.toLowerCase(), args);
}
