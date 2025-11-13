/**
 * Firefly III API Client
 * Handles all interactions with Firefly III API
 */

import { FireflyConfig, FireflyAccount, FireflyTransaction } from './types.js';

export class FireflyClient {
  private baseUrl: string;
  private accessToken: string;

  constructor(config: FireflyConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.accessToken = config.accessToken;
  }

  /**
   * Make authenticated request to Firefly III API
   */
  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firefly API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Test connection to Firefly III
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('GET', '/about');
      return true;
    } catch (error) {
      console.error('[Firefly] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Get all accounts
   */
  async getAccounts(type?: string): Promise<FireflyAccount[]> {
    const params = type ? `?type=${type}` : '';
    const response = await this.request<{ data: FireflyAccount[] }>('GET', `/accounts${params}`);
    return response.data;
  }

  /**
   * Get single account
   */
  async getAccount(id: string): Promise<FireflyAccount> {
    const response = await this.request<{ data: FireflyAccount }>('GET', `/accounts/${id}`);
    return response.data;
  }

  /**
   * Create account
   */
  async createAccount(data: {
    name: string;
    type: string;
    account_number?: string;
    opening_balance?: string;
    opening_balance_date?: string;
    currency_code?: string;
  }): Promise<FireflyAccount> {
    const response = await this.request<{ data: FireflyAccount }>('POST', '/accounts', data);
    return response.data;
  }

  /**
   * Update account
   */
  async updateAccount(id: string, data: Partial<{
    name: string;
    account_number: string;
    notes: string;
  }>): Promise<FireflyAccount> {
    const response = await this.request<{ data: FireflyAccount }>('PUT', `/accounts/${id}`, data);
    return response.data;
  }

  /**
   * Delete account
   */
  async deleteAccount(id: string): Promise<void> {
    await this.request('DELETE', `/accounts/${id}`);
  }

  /**
   * Get transactions
   */
  async getTransactions(params?: {
    start?: string;
    end?: string;
    type?: string;
  }): Promise<FireflyTransaction[]> {
    const queryParams = new URLSearchParams();
    if (params?.start) queryParams.set('start', params.start);
    if (params?.end) queryParams.set('end', params.end);
    if (params?.type) queryParams.set('type', params.type);

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const response = await this.request<{ data: FireflyTransaction[] }>('GET', `/transactions${query}`);
    return response.data;
  }

  /**
   * Get single transaction
   */
  async getTransaction(id: string): Promise<FireflyTransaction> {
    const response = await this.request<{ data: FireflyTransaction }>('GET', `/transactions/${id}`);
    return response.data;
  }

  /**
   * Create transaction
   */
  async createTransaction(data: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    description: string;
    date: string;
    amount: string;
    source_id?: string;
    source_name?: string;
    destination_id?: string;
    destination_name?: string;
    category_name?: string;
    budget_name?: string;
    tags?: string[];
  }): Promise<FireflyTransaction> {
    const payload = {
      error_if_duplicate_hash: false,
      apply_rules: true,
      fire_webhooks: true,
      transactions: [data]
    };

    const response = await this.request<{ data: FireflyTransaction }>('POST', '/transactions', payload);
    return response.data;
  }

  /**
   * Update transaction
   */
  async updateTransaction(id: string, data: Partial<{
    description: string;
    date: string;
    amount: string;
    category_name: string;
    budget_name: string;
    tags: string[];
  }>): Promise<FireflyTransaction> {
    const payload = {
      transactions: [data]
    };
    const response = await this.request<{ data: FireflyTransaction }>('PUT', `/transactions/${id}`, payload);
    return response.data;
  }

  /**
   * Delete transaction
   */
  async deleteTransaction(id: string): Promise<void> {
    await this.request('DELETE', `/transactions/${id}`);
  }

  /**
   * Search
   */
  async search(query: string, field?: string): Promise<any[]> {
    const params = new URLSearchParams({ query });
    if (field) params.set('field', field);

    const response = await this.request<{ data: any[] }>('GET', `/search/transactions?${params.toString()}`);
    return response.data;
  }

  /**
   * Get budgets
   */
  async getBudgets(): Promise<any[]> {
    const response = await this.request<{ data: any[] }>('GET', '/budgets');
    return response.data;
  }

  /**
   * Get categories
   */
  async getCategories(): Promise<any[]> {
    const response = await this.request<{ data: any[] }>('GET', '/categories');
    return response.data;
  }

  /**
   * Get bills
   */
  async getBills(): Promise<any[]> {
    const response = await this.request<{ data: any[] }>('GET', '/bills');
    return response.data;
  }

  /**
   * Get tags
   */
  async getTags(): Promise<any[]> {
    const response = await this.request<{ data: any[] }>('GET', '/tags');
    return response.data;
  }

  /**
   * Get summary
   */
  async getSummary(start: string, end: string): Promise<any> {
    const response = await this.request<any>('GET', `/summary/basic?start=${start}&end=${end}`);
    return response;
  }
}
