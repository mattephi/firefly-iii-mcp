/**
 * MCP Protocol Handler
 * Implements the Model Context Protocol (JSON-RPC 2.0)
 */

import { MCPRequest, MCPResponse, MCPError } from './types.js';
import { tools, executeTool } from './tools.js';
import { FireflyClient } from './firefly-client.js';

export class MCPHandler {
  private fireflyClient: FireflyClient;
  private sessions: Map<string, any> = new Map();

  constructor(fireflyClient: FireflyClient) {
    this.fireflyClient = fireflyClient;
  }

  /**
   * Handle MCP request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { jsonrpc, id, method, params } = request;

    console.log(`[MCP] Received request - Method: ${method}, ID: ${id}`);
    console.log(`[MCP] Request params:`, JSON.stringify(params, null, 2));

    // Validate JSON-RPC version
    if (jsonrpc !== '2.0') {
      console.error('[MCP] Invalid JSON-RPC version:', jsonrpc);
      return this.errorResponse(id, -32600, 'Invalid Request: jsonrpc must be "2.0"');
    }

    try {
      let result: any;

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params);
          break;

        case 'tools/list':
          result = await this.handleToolsList();
          break;

        case 'tools/call':
          result = await this.handleToolsCall(params);
          break;

        case 'ping':
          result = { status: 'ok' };
          break;

        default:
          console.warn(`[MCP] Unknown method requested: ${method}`);
          return this.errorResponse(id, -32601, `Method not found: ${method}`);
      }

      console.log(`[MCP] Request successful - Method: ${method}`);
      console.log(`[MCP] Response:`, JSON.stringify(result, null, 2));

      return {
        jsonrpc: '2.0',
        id,
        result
      };
    } catch (error) {
      console.error(`[MCP] Error handling ${method}:`, error);
      console.error(`[MCP] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
      const message = error instanceof Error ? error.message : 'Internal error';
      return this.errorResponse(id, -32603, message);
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(params: any): Promise<any> {
    const { protocolVersion, capabilities, clientInfo } = params || {};

    console.log('[MCP] ========================================');
    console.log('[MCP] INITIALIZE REQUEST');
    console.log('[MCP] Client:', clientInfo?.name || 'unknown');
    console.log('[MCP] Client version:', clientInfo?.version || 'unknown');
    console.log('[MCP] Protocol version requested:', protocolVersion);
    console.log('[MCP] Client capabilities:', JSON.stringify(capabilities, null, 2));
    console.log('[MCP] ========================================');

    // Test Firefly connection (non-blocking, just warn if fails)
    try {
      const connected = await this.fireflyClient.testConnection();
      if (connected) {
        console.log('[MCP] ✓ Firefly III connection successful');
      } else {
        console.warn('[MCP] ⚠ Firefly III connection test failed - tools may not work properly');
      }
    } catch (error) {
      console.warn('[MCP] ⚠ Firefly III connection test error:', error);
      console.warn('[MCP] Continuing with initialization anyway...');
    }

    const response = {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'firefly-iii-mcp-server',
        version: '2.0.0'
      }
    };

    console.log('[MCP] Sending initialize response:', JSON.stringify(response, null, 2));

    return response;
  }

  /**
   * Handle tools/list request
   */
  private async handleToolsList(): Promise<any> {
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(params: any): Promise<any> {
    const { name, arguments: args } = params;

    if (!name) {
      throw new Error('Tool name is required');
    }

    // Validate tool exists
    const tool = tools.find(t => t.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    console.log(`[MCP] Executing tool: ${name}`);

    // Execute the tool
    const result = await executeTool({ name, arguments: args }, this.fireflyClient);

    // Return result in MCP format
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  /**
   * Create error response
   */
  private errorResponse(id: string | number | undefined, code: number, message: string): MCPResponse {
    const error: MCPError = {
      code,
      message
    };

    return {
      jsonrpc: '2.0',
      id,
      error
    };
  }

  /**
   * Handle batch requests
   */
  async handleBatch(requests: MCPRequest[]): Promise<MCPResponse[]> {
    return Promise.all(requests.map(req => this.handleRequest(req)));
  }
}
