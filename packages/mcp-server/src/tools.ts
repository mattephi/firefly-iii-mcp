/**
 * MCP Tools for Firefly III
 * Defines all available tools and their execution logic
 */

import { MCPTool, MCPToolCall } from './types.js';
import { FireflyClient } from './firefly-client.js';

/**
 * Tool definitions
 */
export const tools: MCPTool[] = [
  {
    name: 'firefly_get_accounts',
    description: 'Get all accounts from Firefly III. Optionally filter by account type (asset, expense, revenue, liability).',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Filter by account type',
          enum: ['asset', 'expense', 'revenue', 'liability', 'initial-balance', 'reconciliation']
        }
      }
    }
  },
  {
    name: 'firefly_get_account',
    description: 'Get details of a specific account by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Account ID'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'firefly_create_account',
    description: 'Create a new account in Firefly III.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Account name'
        },
        type: {
          type: 'string',
          description: 'Account type',
          enum: ['asset', 'expense', 'revenue', 'liability']
        },
        account_number: {
          type: 'string',
          description: 'Optional account number'
        },
        opening_balance: {
          type: 'string',
          description: 'Opening balance amount'
        },
        opening_balance_date: {
          type: 'string',
          description: 'Opening balance date (YYYY-MM-DD)'
        },
        currency_code: {
          type: 'string',
          description: 'Currency code (e.g., USD, EUR)'
        }
      },
      required: ['name', 'type']
    }
  },
  {
    name: 'firefly_update_account',
    description: 'Update an existing account.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Account ID'
        },
        name: {
          type: 'string',
          description: 'New account name'
        },
        account_number: {
          type: 'string',
          description: 'New account number'
        },
        notes: {
          type: 'string',
          description: 'Account notes'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'firefly_delete_account',
    description: 'Delete an account by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Account ID to delete'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'firefly_get_transactions',
    description: 'Get transactions from Firefly III. Optionally filter by date range and type.',
    inputSchema: {
      type: 'object',
      properties: {
        start: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD)'
        },
        end: {
          type: 'string',
          description: 'End date (YYYY-MM-DD)'
        },
        type: {
          type: 'string',
          description: 'Transaction type',
          enum: ['withdrawal', 'deposit', 'transfer']
        }
      }
    }
  },
  {
    name: 'firefly_get_transaction',
    description: 'Get details of a specific transaction by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Transaction ID'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'firefly_create_transaction',
    description: 'Create a new transaction (withdrawal, deposit, or transfer).',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Transaction type',
          enum: ['withdrawal', 'deposit', 'transfer']
        },
        description: {
          type: 'string',
          description: 'Transaction description'
        },
        date: {
          type: 'string',
          description: 'Transaction date (YYYY-MM-DD)'
        },
        amount: {
          type: 'string',
          description: 'Transaction amount'
        },
        source_id: {
          type: 'string',
          description: 'Source account ID'
        },
        source_name: {
          type: 'string',
          description: 'Source account name (if not using ID)'
        },
        destination_id: {
          type: 'string',
          description: 'Destination account ID'
        },
        destination_name: {
          type: 'string',
          description: 'Destination account name (if not using ID)'
        },
        category_name: {
          type: 'string',
          description: 'Category name'
        },
        budget_name: {
          type: 'string',
          description: 'Budget name'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Transaction tags'
        }
      },
      required: ['type', 'description', 'date', 'amount']
    }
  },
  {
    name: 'firefly_update_transaction',
    description: 'Update an existing transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Transaction ID'
        },
        description: {
          type: 'string',
          description: 'New description'
        },
        date: {
          type: 'string',
          description: 'New date (YYYY-MM-DD)'
        },
        amount: {
          type: 'string',
          description: 'New amount'
        },
        category_name: {
          type: 'string',
          description: 'New category'
        },
        budget_name: {
          type: 'string',
          description: 'New budget'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'New tags'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'firefly_delete_transaction',
    description: 'Delete a transaction by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Transaction ID to delete'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'firefly_search',
    description: 'Search transactions in Firefly III.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        field: {
          type: 'string',
          description: 'Field to search in (optional)',
          enum: ['description', 'amount', 'date', 'source', 'destination']
        }
      },
      required: ['query']
    }
  },
  {
    name: 'firefly_get_budgets',
    description: 'Get all budgets from Firefly III.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'firefly_get_categories',
    description: 'Get all categories from Firefly III.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'firefly_get_bills',
    description: 'Get all bills from Firefly III.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'firefly_get_tags',
    description: 'Get all tags from Firefly III.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'firefly_get_summary',
    description: 'Get financial summary for a date range.',
    inputSchema: {
      type: 'object',
      properties: {
        start: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD)'
        },
        end: {
          type: 'string',
          description: 'End date (YYYY-MM-DD)'
        }
      },
      required: ['start', 'end']
    }
  }
];

/**
 * Execute a tool call
 */
export async function executeTool(
  toolCall: MCPToolCall,
  fireflyClient: FireflyClient
): Promise<any> {
  const { name, arguments: args = {} } = toolCall;

  try {
    switch (name) {
      case 'firefly_get_accounts':
        return await fireflyClient.getAccounts(args?.type);

      case 'firefly_get_account':
        return await fireflyClient.getAccount(args.id);

      case 'firefly_create_account':
        return await fireflyClient.createAccount(args as any);

      case 'firefly_update_account':
        return await fireflyClient.updateAccount(args.id, args as any);

      case 'firefly_delete_account':
        await fireflyClient.deleteAccount(args.id);
        return { success: true, message: 'Account deleted' };

      case 'firefly_get_transactions':
        return await fireflyClient.getTransactions(args as any);

      case 'firefly_get_transaction':
        return await fireflyClient.getTransaction(args.id);

      case 'firefly_create_transaction':
        return await fireflyClient.createTransaction(args as any);

      case 'firefly_update_transaction':
        return await fireflyClient.updateTransaction(args.id, args as any);

      case 'firefly_delete_transaction':
        await fireflyClient.deleteTransaction(args.id);
        return { success: true, message: 'Transaction deleted' };

      case 'firefly_search':
        return await fireflyClient.search(args.query, args.field);

      case 'firefly_get_budgets':
        return await fireflyClient.getBudgets();

      case 'firefly_get_categories':
        return await fireflyClient.getCategories();

      case 'firefly_get_bills':
        return await fireflyClient.getBills();

      case 'firefly_get_tags':
        return await fireflyClient.getTags();

      case 'firefly_get_summary':
        return await fireflyClient.getSummary(args.start, args.end);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`[Tools] Error executing ${name}:`, error);
    throw error;
  }
}
