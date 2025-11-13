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

    // Validate JSON-RPC version
    if (jsonrpc !== '2.0') {
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
          return this.errorResponse(id, -32601, `Method not found: ${method}`);
      }

      return {
        jsonrpc: '2.0',
        id,
        result
      };
    } catch (error) {
      console.error(`[MCP] Error handling ${method}:`, error);
      const message = error instanceof Error ? error.message : 'Internal error';
      return this.errorResponse(id, -32603, message);
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(params: any): Promise<any> {
    const { protocolVersion, capabilities, clientInfo } = params || {};

    console.log('[MCP] Initialize request from:', clientInfo?.name || 'unknown client');
    console.log('[MCP] Protocol version:', protocolVersion);

    // Test Firefly connection
    const connected = await this.fireflyClient.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Firefly III');
    }

    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {
          listChanged: false
        }
      },
      serverInfo: {
        name: 'firefly-iii-mcp-server',
        version: '2.0.0'
      },
      instructions: 'MCP server for Firefly III personal finance manager. Use the available tools to manage accounts, transactions, budgets, and more.'
    };
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
