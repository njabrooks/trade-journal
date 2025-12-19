/**
 * IBKR API Error Classes
 */

export class IbkrApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: string
  ) {
    super(message);
    this.name = 'IbkrApiError';
  }
}

export class IbkrGatewayError extends IbkrApiError {
  constructor(message: string, statusCode?: number, response?: string) {
    super(`Gateway error: ${message}`, statusCode, response);
    this.name = 'IbkrGatewayError';
  }
}

export class IbkrAuthError extends IbkrApiError {
  constructor(message: string = 'Authentication required') {
    super(`Authentication error: ${message}`);
    this.name = 'IbkrAuthError';
  }
}

export class IbkrContractNotFoundError extends IbkrApiError {
  constructor(ticker: string) {
    super(`Contract not found for ticker: ${ticker}`);
    this.name = 'IbkrContractNotFoundError';
  }
}

