#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    port: 8126,
    jsonFile: null,
    resourceName: null,
    resourceUri: null,
    serverName: 'Generic MCP RAG Server',
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--file':
      case '-f':
        config.jsonFile = args[++i];
        break;
      case '--port':
      case '-p':
        config.port = parseInt(args[++i]);
        break;
      case '--name':
      case '-n':
        config.resourceName = args[++i];
        break;
      case '--uri':
      case '-u':
        config.resourceUri = args[++i];
        break;
      case '--server-name':
      case '-s':
        config.serverName = args[++i];
        break;
      case '--help':
      case '-h':
        config.help = true;
        break;
      default:
        if (!config.jsonFile && !arg.startsWith('-')) {
          config.jsonFile = arg;
        }
        break;
    }
  }

  return config;
}

function showHelp() {
  console.log(`
Generic MCP RAG Server

Usage: node mcp-rag-server.js [options] [json-file]

Options:
  -f, --file <path>        Path to JSON file to serve (required)
  -p, --port <number>      Port to run server on (default: 8126)
  -n, --name <string>      Human-readable name for the resource
  -u, --uri <string>       URI identifier for the resource
  -s, --server-name <name> Name of the MCP server
  -h, --help               Show this help message

Examples:
  node mcp-rag-server.js data.json
  node mcp-rag-server.js --file docs.json --port 8127 --name "Documentation"
  node mcp-rag-server.js -f corpus.json -n "AI Corpus" -u "ai:corpus"
`);
}

// Configuration
const config = parseArgs();

if (config.help) {
  showHelp();
  process.exit(0);
}

if (!config.jsonFile) {
  console.error('Error: JSON file path is required.');
  console.error('Use --help for usage information.');
  process.exit(1);
}

// Resolve and validate JSON file path
const JSON_FILE = path.resolve(config.jsonFile);
if (!fs.existsSync(JSON_FILE)) {
  console.error(`Error: JSON file not found: ${JSON_FILE}`);
  process.exit(1);
}

// Generate default values based on file name
const fileName = path.basename(JSON_FILE, '.json');
const resourceName = config.resourceName || fileName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
const resourceUri = config.resourceUri || `rag:${fileName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

console.log(`Loading JSON data from ${JSON_FILE}...`);
let jsonData;
try {
  const rawData = fs.readFileSync(JSON_FILE, 'utf8');
  jsonData = JSON.parse(rawData);
  const dataSize = typeof jsonData === 'object' ? Object.keys(jsonData).length : 1;
  console.log(`JSON data loaded successfully (${dataSize} ${typeof jsonData === 'object' ? 'entries' : 'item'})`);
} catch (error) {
  console.error(`Error loading JSON file: ${error.message}`);
  process.exit(1);
}

// Prepare resources for MCP
const resources = {
  [resourceUri]: {
    uri: resourceUri,
    name: resourceName,
    description: `RAG resource for ${fileName}`,
    content: jsonData
  }
};

// Helper to send SSE events
function sendSseEvent(res, eventName, data) {
  const event = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  console.log(`Sending ${eventName} event`); 
  res.write(event);
}

// Handle POST body
function collectRequestBody(request) {
  return new Promise((resolve, reject) => {
    const body = [];
    request.on('data', (chunk) => {
      body.push(chunk);
    });
    request.on('end', () => {
      try {
        const data = Buffer.concat(body).toString();
        if (data && data.trim()) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          resolve({});
        }
      } catch (e) {
        reject(e);
      }
    });
    request.on('error', reject);
  });
}

// Enhanced search function
function searchInData(data, query, path = '') {
  const results = [];
  const searchQuery = query.toLowerCase();

  function traverse(obj, currentPath) {
    if (typeof obj === 'string') {
      if (obj.toLowerCase().includes(searchQuery)) {
        results.push({
          path: currentPath,
          type: 'string',
          value: obj,
          context: obj.length > 200 ? obj.substring(0, 200) + '...' : obj
        });
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        traverse(item, `${currentPath}[${index}]`);
      });
    } else if (typeof obj === 'object' && obj !== null) {
      Object.entries(obj).forEach(([key, value]) => {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        
        // Check if key matches
        if (key.toLowerCase().includes(searchQuery)) {
          results.push({
            path: newPath,
            type: 'key',
            key: key,
            value: value,
            context: typeof value === 'object' ? JSON.stringify(value).substring(0, 200) + '...' : String(value)
          });
        }
        
        // Recurse into value
        traverse(value, newPath);
      });
    } else if (String(obj).toLowerCase().includes(searchQuery)) {
      results.push({
        path: currentPath,
        type: typeof obj,
        value: obj,
        context: String(obj)
      });
    }
  }

  traverse(data, path);
  return results;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Log all requests
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  // Parse URL for query parameters
  const parsedUrl = new URL(req.url, `http://localhost:${config.port}`);
  
  // Handle SSE endpoint
  if (parsedUrl.pathname === '/sse') {
    // Handle different HTTP methods
    if (req.method === 'GET' || req.method === 'POST') {
      
      // If POST request, check if it's JSON-RPC first
      if (req.method === 'POST') {
        // Parse body to determine response type
        const body = await collectRequestBody(req);
        console.log('Received POST body:', JSON.stringify(body, null, 2));
        
        // Check if this is a JSON-RPC 2.0 message
        if (body.jsonrpc === '2.0' && body.method) {
          // Check if this is a notification (no 'id' field) - notifications don't expect responses
          if (!body.hasOwnProperty('id')) {
            console.log(`Received notification: ${body.method}`);
            // Handle notifications
            if (body.method === 'notifications/initialized') {
              console.log('Client has completed initialization');
            }
            // Don't send any response for notifications
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            return;
          }
          
          // Handle JSON-RPC request - respond with JSON, not SSE
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          
          let response;
          
          if (body.method === 'initialize') {
            // MCP initialization handshake
            response = {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                protocolVersion: '2025-03-26',
                capabilities: {
                  resources: {
                    subscribe: false,
                    listChanged: false
                  },
                  tools: {
                    listChanged: false
                  }
                },
                serverInfo: {
                  name: config.serverName,
                  version: '1.0.0'
                }
              }
            };
          } else if (body.method === 'resources/list') {
            // List available resources
            const resourceList = Object.values(resources).map(resource => ({
              uri: resource.uri,
              name: resource.name,
              description: resource.description,
              mimeType: 'application/json'
            }));
            response = {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                resources: resourceList
              }
            };
          } else if (body.method === 'resources/read') {
            // Read a specific resource
            const uri = body.params?.uri;
            if (uri && resources[uri]) {
              response = {
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  content: resources[uri].content
                }
              };
            } else {
              response = {
                jsonrpc: '2.0',
                id: body.id,
                error: {
                  code: -32602,
                  message: `Resource not found: ${uri}`
                }
              };
            }
          } else if (body.method === 'tools/list') {
            // List available tools
            response = {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                tools: [{
                  name: 'search_data',
                  description: `Search the ${resourceName} data for information`,
                  parameters: {
                    type: 'object',
                    properties: {
                      query: {
                        type: 'string',
                        description: 'Search query to find information in the data'
                      }
                    },
                    required: ['query']
                  }
                }]
              }
            };
          } else if (body.method === 'tools/call') {
            // Call a tool
            const toolName = body.params?.name;
            if (toolName === 'search_data') {
              const query = body.params?.arguments?.query || '';
              console.log(`Searching data for: "${query}"`);
              
              // Enhanced search implementation
              const results = searchInData(jsonData, query);
              
              response = {
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  content: [{
                    type: 'text',
                    text: results.length > 0 
                      ? `Found ${results.length} results for "${query}":\n\n${JSON.stringify(results, null, 2)}`
                      : `No results found for "${query}". Try using broader search terms or check the data structure.`
                  }]
                }
              };
            } else {
              response = {
                jsonrpc: '2.0',
                id: body.id,
                error: {
                  code: -32602,
                  message: `Tool not found: ${toolName}`
                }
              };
            }
          } else {
            // Unknown method
            response = {
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32601,
                message: `Method not found: ${body.method}`
              }
            };
          }
          
          console.log('Sending JSON-RPC response:', JSON.stringify(response, null, 2));
          res.end(JSON.stringify(response));
          return; // Exit early for JSON-RPC responses
        }
        // If not JSON-RPC, fall through to SSE handling
      }
      
      // Set headers for SSE (for GET requests or non-JSON-RPC POST requests)
      if (!res.headersSent) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
      }
      
      console.log('Client connected, sending initialization events');
      
      // Send initial events
      sendSseEvent(res, 'open', { message: 'Connection established' });
      sendSseEvent(res, 'ready', { ready: true });
      
      // Handle remaining POST logic for non-JSON-RPC requests
      if (req.method === 'POST') {
        // Body already parsed above, handle non-JSON-RPC POST requests
        try {
          // This POST request was not JSON-RPC, so send resources via SSE
          Object.values(resources).forEach(resource => {
            sendSseEvent(res, 'resource', resource);
          });
        } catch (err) {
          console.error('Error processing POST body:', err);
          sendSseEvent(res, 'error', { message: 'Error processing request' });
        }
      } else {
        // For GET requests, send all resources
        Object.values(resources).forEach(resource => {
          sendSseEvent(res, 'resource', resource);
        });
      }
      
      // Handle client disconnect
      req.on('close', () => {
        console.log('Client disconnected from SSE stream');
      });

      // Keep connection open with ping
      const keepAlive = setInterval(() => {
        res.write(': ping\n\n');
      }, 30000);

      req.on('close', () => {
        clearInterval(keepAlive);
      });
    } else {
      // Method not allowed
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method not allowed. Use GET or POST.');
    }
  } else {
    // Handle other routes - show server info
    res.writeHead(200, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({
      name: config.serverName,
      version: '1.0.0',
      endpoint: '/sse',
      resource: {
        uri: resourceUri,
        name: resourceName,
        file: JSON_FILE
      }
    }, null, 2));
  }
});

// Start server
server.listen(config.port, () => {
  console.log(`${config.serverName} running on http://localhost:${config.port}`);
  console.log(`SSE endpoint available at http://localhost:${config.port}/sse`);
  console.log(`Serving resource: ${resourceName} (${resourceUri})`);
  console.log(`Source file: ${JSON_FILE}`);
});

// Handle errors
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Server shutting down...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});