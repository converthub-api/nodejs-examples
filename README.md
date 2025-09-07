# ConvertHub API Node.js Examples

Complete Node.js code examples for integrating with the [ConvertHub API](https://converthub.com/api) - a powerful file conversion service supporting 800+ format pairs.

## 🚀 Quick Start

1. **Get your API key** from [https://converthub.com/api](https://converthub.com/api)
2. **Clone this repository**:
   ```bash
   git clone https://github.com/converthub-api/nodejs-examples.git
   cd nodejs-examples
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Configure your API key**:
   ```bash
   cp .env.example .env
   # Edit .env and add your API key
   ```
5. **Run any example**:
   ```bash
   node simple-convert/convert.js document.pdf docx
   ```

## 📁 Examples Directory Structure

Each directory contains working examples for specific API endpoints:

### 1. Simple Convert (`/simple-convert`)
Direct file upload and conversion (files up to 50MB).

- `convert.js` - Convert a local file with automatic download

```bash
# Basic conversion
node simple-convert/convert.js image.png jpg

# With API key option
node simple-convert/convert.js document.pdf docx --api-key=YOUR_KEY
```

### 2. URL Convert (`/url-convert`)
Convert files directly from URLs without downloading them first.

- `convert-from-url.js` - Convert a file from any public URL

```bash
node url-convert/convert-from-url.js https://example.com/file.pdf docx
```

### 3. Chunked Upload (`/chunked-upload`)
Upload and convert large files (up to 2GB) in chunks.

- `upload-large-file.js` - Upload large files in configurable chunks

```bash
# Default 5MB chunks
node chunked-upload/upload-large-file.js video.mov mp4

# Custom chunk size
node chunked-upload/upload-large-file.js large.pdf docx --chunk-size=10
```

### 4. Job Management (`/job-management`)
Track and manage conversion jobs with dedicated scripts for each operation.

- `check-status.js` - Check job status and optionally watch progress
- `cancel-job.js` - Cancel a running or queued job
- `delete-file.js` - Delete converted file from storage
- `download-result.js` - Download the converted file

```bash
# Check job status
node job-management/check-status.js job_123e4567-e89b-12d3

# Watch progress until complete
node job-management/check-status.js job_123e4567-e89b-12d3 --watch

# Cancel a running job
node job-management/cancel-job.js job_123e4567-e89b-12d3

# Delete a completed file
node job-management/delete-file.js job_123e4567-e89b-12d3

# Download if complete
node job-management/check-status.js job_123e4567-e89b-12d3 --download

# Download conversion result separately
node job-management/download-result.js job_123e4567-e89b-12d3

# Download with custom path
node job-management/download-result.js job_123e4567-e89b-12d3 ./output.pdf
```

### 5. Format Discovery (`/format-discovery`)
Explore supported formats and conversions.

- `list-formats.js` - List formats, check conversions, explore possibilities

```bash
# List all supported formats
node format-discovery/list-formats.js list

# List formats by category
node format-discovery/list-formats.js list document
node format-discovery/list-formats.js list image
node format-discovery/list-formats.js list video

# Show all conversions from a format
node format-discovery/list-formats.js conversions pdf

# Check if specific conversion is supported
node format-discovery/list-formats.js check docx pdf

# List all categories
node format-discovery/list-formats.js categories
```

### 6. Webhook Handler (`/webhook-handler`)
Receive real-time conversion notifications.

- `webhook-receiver.js` - Production-ready webhook endpoint

Start the server and use its URL as the webhook endpoint:
```bash
# Start webhook server
node webhook-handler/webhook-receiver.js

# In another terminal, expose it publicly with ngrok
ngrok http 3000

# When submitting conversions, use the ngrok URL:
# https://abc123.ngrok.io/webhook
```

## 🔑 Authentication

All API requests require a Bearer token. Get your API key at [https://converthub.com/api](https://converthub.com/api).

### Method 1: Environment File (Recommended)
```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your key
API_KEY="your_api_key_here"
```

### Method 2: Command Line Parameter
```bash
node simple-convert/convert.js file.pdf docx --api-key=your_key_here
```

### Method 3: Direct in Code
```javascript
const API_KEY = 'your_api_key_here';
const headers = {
    'Authorization': `Bearer ${API_KEY}`
};
```

## 📊 Supported Conversions

The API supports 800+ format conversions, some popular ones include:

| Category | Formats |
|----------|---------|
| **Images** | JPG, PNG, WEBP, GIF, BMP, TIFF, SVG, HEIC, ICO, TGA |
| **Documents** | PDF, DOCX, DOC, TXT, RTF, ODT, HTML, MARKDOWN, TEX |
| **Spreadsheets** | XLSX, XLS, CSV, ODS, TSV |
| **Presentations** | PPTX, PPT, ODP, KEY |
| **Videos** | MP4, WEBM, AVI, MOV, MKV, WMV, FLV, MPG |
| **Audio** | MP3, WAV, OGG, M4A, FLAC, AAC, WMA, OPUS |
| **eBooks** | EPUB, MOBI, AZW3, FB2, LIT |
| **Archives** | ZIP, RAR, 7Z, TAR, GZ, BZ2 |

## ⚙️ Conversion Options

Customize your conversions with various options:

```bash
# With chunked upload options:
node chunked-upload/upload-large-file.js video.mov mp4 --chunk-size=10 --webhook=https://your-server.com/webhook

# Available chunked upload options:
--chunk-size=MB    # Chunk size in megabytes (default: 5MB)
--webhook=URL      # Webhook URL for notifications
--api-key=KEY      # Your API key
```

## 🚦 Error Handling

All examples include comprehensive error handling:

```javascript
// Every script handles API errors properly:
if (error.response?.data?.error) {
    console.error(`Error: ${error.response.data.error.message}`);
    if (error.response.data.error.code) {
        console.error(`Code: ${error.response.data.error.code}`);
    }
}
```

Common error codes:
- `AUTHENTICATION_REQUIRED` - Missing or invalid API key
- `NO_MEMBERSHIP` - No active membership found
- `INSUFFICIENT_CREDITS` - No credits remaining
- `FILE_TOO_LARGE` - File exceeds size limit
- `UNSUPPORTED_FORMAT` - Format not supported
- `CONVERSION_FAILED` - Processing error

## 📈 Rate Limits

| Endpoint | Limit | Script |
|----------|-------|--------|
| Convert | 60/minute | `simple-convert/convert.js` |
| Convert URL | 60/minute | `url-convert/convert-from-url.js` |
| Status Check | 100/minute | `job-management/check-status.js` |
| Format Discovery | 200/minute | `format-discovery/list-formats.js` |
| Chunked Upload | 500/minute | `chunked-upload/upload-large-file.js` |

## 🔧 Requirements

- Node.js 14.0 or higher
- npm or yarn package manager

## 📚 File Descriptions

| File | Purpose |
|------|---------|
| `.env.example` | Environment configuration template |
| `.gitignore` | Git ignore rules for sensitive files |
| `package.json` | Node.js package dependencies |
| **Simple Convert** | |
| `simple-convert/convert.js` | Convert local files up to 50MB |
| **URL Convert** | |
| `url-convert/convert-from-url.js` | Convert files from URLs |
| **Chunked Upload** | |
| `chunked-upload/upload-large-file.js` | Upload files up to 2GB in chunks |
| **Job Management** | |
| `job-management/check-status.js` | Check job status, watch, cancel, delete, download |
| `job-management/download-result.js` | Download conversion results |
| **Format Discovery** | |
| `format-discovery/list-formats.js` | Explore supported formats |
| **Webhook Handler** | |
| `webhook-handler/webhook-receiver.js` | Handle webhook notifications |

## 💡 Usage Examples

### Convert a PDF to Word
```bash
node simple-convert/convert.js document.pdf docx
```

### Convert an image from URL
```bash
node url-convert/convert-from-url.js https://example.com/photo.png jpg
```

### Upload a large video
```bash
node chunked-upload/upload-large-file.js movie.mov mp4 --chunk-size=10
```

### Monitor conversion progress
```bash
node job-management/check-status.js job_abc123 --watch
```

### Check if conversion is supported
```bash
node format-discovery/list-formats.js check heic jpg
```

## 🤝 Support

- **API Documentation**: [https://converthub.com/api/docs](https://converthub.com/api/docs)
- **Developer Dashboard**: [https://converthub.com/developers](https://converthub.com/developers)
- **Get API Key**: [https://converthub.com/api](https://converthub.com/api)
- **Email Support**: support@converthub.com

## 📄 License

These examples are provided under the MIT License. Feel free to use and modify them for your projects.

## 🙏 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

Built with ❤️ by [ConvertHub](https://converthub.com) - Making file conversion simple and powerful.
