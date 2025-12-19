/**
 * IBKR Client Portal Gateway API Client
 * 
 * Handles HTTP communication with the local IBKR gateway
 * 
 * Environment Variables:
 * - IBKR_GATEWAY_URL: Gateway URL (default: https://localhost:5001)
 * - IBKR_GATEWAY_SSL_VERIFY: Whether to verify SSL cert (default: false for self-signed)
 */

import { IbkrApiError, IbkrGatewayError, IbkrAuthError } from './errors';
import type { AuthStatus } from './types';

function getGatewayConfig() {
  const baseUrl = process.env.IBKR_GATEWAY_URL || 'https://localhost:5001';
  // Default to false for self-signed certs (only verify if explicitly set to 'true')
  const sslVerify = process.env.IBKR_GATEWAY_SSL_VERIFY === 'true';
  
  return {
    baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
    sslVerify,
  };
}

/**
 * Handle response from IBKR gateway
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    
    // Check for "no bridge" error - this means gateway is authenticated but bridge connection is down
    if (errorText.includes('no bridge') || errorText.includes('Bad Request: no bridge')) {
      throw new IbkrGatewayError(
        'Gateway authenticated but bridge connection to IBKR servers is unavailable. Try re-authenticating at https://localhost:5001',
        response.status,
        errorText
      );
    }
    
    // Check for authentication errors
    if (response.status === 401 || response.status === 403) {
      throw new IbkrAuthError(`Authentication failed: ${response.statusText}`);
    }
    
    // Check for gateway not running
    if (response.status === 0 || response.status >= 500) {
      throw new IbkrGatewayError(
        `Gateway error: ${response.statusText}`,
        response.status,
        errorText
      );
    }
    
    // Check for "no bridge" error - gateway authenticated but bridge connection unavailable
    if (errorText.includes('no bridge') || errorText.includes('Bad Request: no bridge')) {
      throw new IbkrGatewayError(
        'Gateway authenticated but bridge connection to IBKR servers unavailable. Try re-authenticating at https://localhost:5001 and wait a moment for the bridge to establish.',
        response.status,
        errorText
      );
    }
    
    throw new IbkrApiError(
      `API error: ${response.statusText}`,
      response.status,
      errorText
    );
  }

  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    if (text.trim() === '' || text.includes('<html>')) {
      throw new IbkrGatewayError('Gateway returned non-JSON response (is gateway running?)');
    }
  }

  return await response.json();
}

/**
 * Makes a request to the IBKR gateway
 * Handles SSL certificate issues (self-signed cert) and error responses
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const config = getGatewayConfig();
  const url = `${config.baseUrl}${endpoint}`;

  const fetchOptions: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    // For self-signed certificates on localhost, we need to disable SSL verification
    // In Next.js server-side, we set the environment variable before fetch
    if (!config.sslVerify && url.startsWith('https://localhost')) {
      // Set NODE_TLS_REJECT_UNAUTHORIZED=0 for this request
      // This is safe for localhost connections only
      const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      
      // Temporarily disable SSL verification
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      
      try {
        const response = await fetch(url, {
          ...fetchOptions,
          // Next.js fetch respects NODE_TLS_REJECT_UNAUTHORIZED
        });
        
        // Restore original setting immediately after fetch
        if (originalRejectUnauthorized !== undefined) {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
        } else {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        }
        
        return await handleResponse<T>(response);
      } catch (fetchError) {
        // Always restore original setting on error
        if (originalRejectUnauthorized !== undefined) {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
        } else {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        }
        throw fetchError;
      }
    }

    // For non-localhost or when SSL verification is enabled
    const response = await fetch(url, fetchOptions);
    return await handleResponse<T>(response);
  } catch (error) {
    if (error instanceof IbkrApiError || error instanceof IbkrGatewayError || error instanceof IbkrAuthError) {
      throw error;
    }
    
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new IbkrGatewayError(
        'Failed to connect to gateway. Is it running on ' + config.baseUrl + '?',
        0
      );
    }
    
    throw new IbkrApiError(
      error instanceof Error ? error.message : 'Unknown error',
      undefined,
      String(error)
    );
  }
}

/**
 * Check authentication status
 */
export async function checkAuth(): Promise<AuthStatus> {
  return request<AuthStatus>('/v1/api/iserver/auth/status');
}

/**
 * Verify gateway is running and authenticated
 * 
 * Note: The /iserver/auth/status endpoint is unreliable, so we test
 * an actual authenticated endpoint (/tickle) instead.
 */
export async function verifyGateway(): Promise<boolean> {
  try {
    // Test with /tickle endpoint - it requires authentication and is lightweight
    await get('/v1/api/tickle');
    return true;
  } catch (error) {
    if (error instanceof IbkrGatewayError) {
      console.error('Gateway not running or unreachable:', error.message);
    } else if (error instanceof IbkrAuthError) {
      console.error('Gateway not authenticated. Please log in at https://localhost:5001');
    } else {
      // Network errors or other issues
      const config = getGatewayConfig();
      console.error('Failed to verify gateway:', error instanceof Error ? error.message : String(error));
      console.error('Make sure gateway is running at', config.baseUrl);
    }
    return false;
  }
}

/**
 * GET request helper
 */
export async function get<T>(endpoint: string): Promise<T> {
  return request<T>(endpoint, { method: 'GET' });
}

/**
 * POST request helper
 */
export async function post<T>(endpoint: string, body?: any): Promise<T> {
  return request<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export { getGatewayConfig };
