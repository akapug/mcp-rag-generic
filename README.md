# Generic MCP-RAG Server

A versatile Model Context Protocol (MCP) server that can serve **any JSON file** as a searchable resource for AI assistants like Windsurf and Cursor. Transform your data into an AI-accessible knowledge base in seconds.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/akapug/mcp-rag-generic.git
cd mcp-rag-generic

# Serve any JSON file
node mcp-rag-server.js your-data.json

# Or with custom configuration
node mcp-rag-server.js --file docs.json --name "Documentation" --port 8127
```

## ✨ Features

- **Universal JSON Support**: Works with any valid JSON file structure
- **Zero Dependencies**: Uses only Node.js built-in modules
- **Command Line Interface**: Flexible configuration via CLI arguments
- **Enhanced Search**: Deep search through nested JSON structures
- **MCP Protocol Compliant**: Full support for the Model Context Protocol
- **Real-time Ready**: Server-Sent Events (SSE) support
- **Auto-configuration**: Smart defaults based on your file name

## 📋 Requirements

- Node.js 14.x or higher
- Any JSON file you want to make searchable

## 🛠 Installation

### Option 1: Clone and Run
```bash
git clone https://github.com/akapug/mcp-rag-generic.git
cd mcp-rag-generic
node mcp-rag-server.js --help
```

### Option 2: Direct Download
Download `mcp-rag-server.js` and run it directly:
```bash
node mcp-rag-server.js your-data.json
```

## 📖 Usage

### Basic Usage
```bash
# Serve a JSON file with automatic configuration
node mcp-rag-server.js data.json
```

### Advanced Configuration
```bash
node mcp-rag-server.js \
  --file my-docs.json \
  --name "My Documentation" \
  --uri "docs:knowledge" \
  --port 8127 \
  --server-name "Custom RAG Server"
```

### Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--file` | `-f` | Path to JSON file to serve | *required* |
| `--port` | `-p` | Port to run server on | `8126` |
| `--name` | `-n` | Human-readable resource name | Auto-generated |
| `--uri` | `-u` | URI identifier for the resource | Auto-generated |
| `--server-name` | `-s` | Name of the MCP server | "Generic MCP RAG Server" |
| `--help` | `-h` | Show help message | - |

### Auto-Generated Defaults

If you don't specify `--name` or `--uri`, the server will generate them from your filename:

- File: `api-documentation.json`
- Name: `"Api Documentation"`
- URI: `"rag:api_documentation"`

## 🔌 Windsurf/Cursor Integration

### 1. Start the Server
```bash
node mcp-rag-server.js your-data.json
# Server running on http://localhost:8126
```

### 2. Configure MCP Client
Add to your `mcp_config.json`:

```json
{
  "mcpServers": {
    "MyDataRAG": {
      "serverUrl": "http://localhost:8126/sse"
    }
  }
}
```

### 3. Restart Your AI Assistant
Restart Windsurf or Cursor to load the new MCP server.

### 4. Start Searching!
Your AI assistant can now search your JSON data:
- Use the `search_data` tool to query your content
- Access the full JSON structure as an MCP resource
- Get contextual search results with data paths

## 🔍 Search Capabilities

The server provides powerful search functionality:

### Search Types
- **Key Matching**: Finds JSON keys that contain your search term
- **Value Searching**: Searches through all string values
- **Deep Traversal**: Searches nested objects and arrays
- **Path Tracking**: Shows exactly where each result was found

### Search Results Format
```json
{
  "path": "projects.frontend.dependencies[2]",
  "type": "string",
  "value": "react-router-dom",
  "context": "react-router-dom"
}
```

## 📊 Example Use Cases

### API Documentation
```bash
node mcp-rag-server.js api-docs.json --name "API Reference"
```

### Configuration Data
```bash
node mcp-rag-server.js config.json --name "App Config" --port 8127
```

### Knowledge Base
```bash
node mcp-rag-server.js knowledge.json --name "Company Knowledge"
```

### Product Catalog
```bash
node mcp-rag-server.js products.json --name "Product Catalog"
```

## 🏗 JSON Structure Support

The server works with any JSON structure:

```json
// Simple object
{"name": "value"}

// Nested objects
{
  "section": {
    "subsection": {
      "data": "searchable content"
    }
  }
}

// Arrays
{
  "items": [
    {"name": "item1"},
    {"name": "item2"}
  ]
}

// Mixed structures
{
  "metadata": {"version": "1.0"},
  "data": [
    {"id": 1, "info": {"details": "searchable"}}
  ]
}
```

## 🔧 Server Information Endpoint

Visit `http://localhost:8126` (or your configured port) to see server information:

```json
{
  "name": "Generic MCP RAG Server",
  "version": "1.0.0",
  "endpoint": "/sse",
  "resource": {
    "uri": "rag:your_data",
    "name": "Your Data",
    "file": "/path/to/your-data.json"
  }
}
```

---

**Made with ❤️ for the AI development community**