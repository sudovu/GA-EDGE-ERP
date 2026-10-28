const API_BASE = '/api/v1';

export class ApiClient {
  private static token: string | null = localStorage.getItem('nexus_auth_token');

  static setToken(token: string) {
    this.token = token;
    localStorage.setItem('nexus_auth_token', token);
  }

  static getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('nexus_auth_token');
    }
    return this.token;
  }

  static clearToken() {
    this.token = null;
    localStorage.removeItem('nexus_auth_token');
  }

  static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.clearToken();
      window.dispatchEvent(new Event('auth-unauthorized'));
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Server request failed');
    }

    return data as T;
  }
}
