/**
 * IBKR Flex Web Service API Client
 * 
 * Handles fetching Flex query results from IBKR Flex Web Service API
 * Documentation: https://www.interactivebrokers.com/en/index.php?f=16457
 * 
 * Environment Variables:
 * - IBKR_FLEX_TOKEN: Default FLEX token (can be overridden per config)
 * - IBKR_FLEX_POSITIONS_QUERY_ID: Default positions query ID
 * - IBKR_FLEX_TRADES_QUERY_ID: Default trades query ID
 * - IBKR_FLEX_BASE_URL: Base URL for Flex API (default: https://gdcdyn.interactivebrokers.com/Universal/servlet)
 * - IBKR_FLEX_WAIT_MS: Wait time in ms before fetching results (default: 3000)
 */

export interface FlexQueryConfig {
  flexToken?: string; // Optional - will use IBKR_FLEX_TOKEN from env if not provided
  queryId?: string; // Optional - will use IBKR_FLEX_POSITIONS_QUERY_ID or IBKR_FLEX_TRADES_QUERY_ID from env if not provided
  queryType: 'positions' | 'trades';
}

export interface FlexQueryResult {
  csv: string;
  contentType: string;
}

export class FlexApiError extends Error {
  constructor(message: string, public statusCode?: number, public response?: string) {
    super(message);
    this.name = 'FlexApiError';
  }
}

/**
 * Gets Flex API configuration from environment variables
 */
function getFlexApiConfig() {
  let baseUrl = process.env.IBKR_FLEX_BASE_URL;
  
  // If not set, try common IBKR Flex endpoints
  if (!baseUrl) {
    // Common IBKR Flex Web Service endpoints:
    // 1. https://www.interactivebrokers.com/Universal/servlet (most common)
    // 2. https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService
    // 3. https://gdcdyn.interactivebrokers.com/Universal/servlet (may not exist)
    baseUrl = 'https://www.interactivebrokers.com/Universal/servlet';
    console.warn('IBKR_FLEX_BASE_URL not set, using default:', baseUrl);
  }
  
  // Ensure base URL doesn't have trailing slash
  baseUrl = baseUrl.replace(/\/$/, '');
  
  // Validate base URL format
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    console.warn(`IBKR_FLEX_BASE_URL should start with http:// or https://, got: ${baseUrl}`);
  }
  
  const waitMs = parseInt(process.env.IBKR_FLEX_WAIT_MS || '3000', 10);
  const defaultToken = process.env.IBKR_FLEX_TOKEN;
  const defaultPositionsQueryId = process.env.IBKR_FLEX_POSITIONS_QUERY_ID;
  const defaultTradesQueryId = process.env.IBKR_FLEX_TRADES_QUERY_ID;

  console.log('Flex API Config:', {
    baseUrl,
    waitMs,
    hasToken: !!defaultToken,
    hasPositionsQueryId: !!defaultPositionsQueryId,
    hasTradesQueryId: !!defaultTradesQueryId,
  });

  return {
    baseUrl,
    waitMs,
    defaultToken,
    defaultPositionsQueryId,
    defaultTradesQueryId,
  };
}

/**
 * Fetches Flex query results from IBKR Flex Web Service API
 * 
 * Uses environment variables for defaults:
 * - IBKR_FLEX_TOKEN (if not provided in config)
 * - IBKR_FLEX_POSITIONS_QUERY_ID or IBKR_FLEX_TRADES_QUERY_ID (if not provided in config)
 * - IBKR_FLEX_BASE_URL (default: https://gdcdyn.interactivebrokers.com/Universal/servlet)
 * - IBKR_FLEX_WAIT_MS (wait time before fetching, default: 3000ms)
 * 
 * @param config Flex query configuration
 * @returns CSV content as string
 */
export async function fetchFlexQuery(config: FlexQueryConfig): Promise<FlexQueryResult> {
  const apiConfig = getFlexApiConfig();
  
  // Resolve token and query ID from config or environment
  const flexToken = config.flexToken || apiConfig.defaultToken;
  let queryId = config.queryId;
  
  // If query ID not provided, use default from env based on query type
  if (!queryId) {
    queryId = config.queryType === 'positions' 
      ? apiConfig.defaultPositionsQueryId 
      : apiConfig.defaultTradesQueryId;
  }

  if (!flexToken) {
    throw new FlexApiError(
      'FLEX_TOKEN is required. Provide in config or set IBKR_FLEX_TOKEN environment variable.'
    );
  }

  if (!queryId) {
    throw new FlexApiError(
      `QUERY_ID is required. Provide in config or set IBKR_FLEX_${config.queryType.toUpperCase()}_QUERY_ID environment variable.`
    );
  }

  // Build URL using configured base URL
  // IBKR Flex Web Service typically uses:
  // 1. SendRequest to initiate query generation
  // 2. GetStatement to retrieve the results
  // However, some endpoints may return CSV directly
  
  // Ensure base URL doesn't have trailing slash
  const baseUrl = apiConfig.baseUrl.replace(/\/$/, '');
  const sendRequestUrl = `${baseUrl}/FlexStatementService.SendRequest?t=${encodeURIComponent(flexToken)}&q=${encodeURIComponent(queryId)}&v=3`;
  
  console.log('Flex API request:', {
    url: sendRequestUrl.replace(flexToken, '***REDACTED***'),
    baseUrl,
    queryId,
    waitMs: apiConfig.waitMs,
  });
  
  try {
    // Step 1: Send request to generate the query
    let requestResponse: Response;
    try {
      // Create AbortController for timeout (AbortSignal.timeout may not be available in all Node versions)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        requestResponse = await fetch(sendRequestUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/xml, application/xml, */*',
            'User-Agent': 'TradeJournal/1.0',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (fetchError) {
      // Network-level errors (SSL, DNS, connection refused, etc.)
      const errorDetails = fetchError instanceof Error 
        ? {
            name: fetchError.name,
            message: fetchError.message,
            cause: fetchError.cause,
            stack: fetchError.stack,
          }
        : fetchError;
      
      console.error('Flex API fetch error:', {
        url: sendRequestUrl.replace(flexToken, '***REDACTED***'),
        baseUrl,
        error: errorDetails,
      });
      
      // Provide more helpful error message
      let errorMsg = `Network error connecting to Flex API: ${fetchError instanceof Error ? fetchError.message : 'Unknown network error'}`;
      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError') {
          errorMsg = 'Request to Flex API timed out after 30 seconds';
        } else if (fetchError.message.includes('certificate') || fetchError.message.includes('SSL')) {
          errorMsg = `SSL/TLS error connecting to Flex API: ${fetchError.message}. Check if the base URL uses HTTPS correctly.`;
        } else if (fetchError.message.includes('ENOTFOUND') || fetchError.message.includes('getaddrinfo')) {
          // Extract hostname from error cause if available
          const hostname = (fetchError.cause as any)?.hostname || new URL(baseUrl).hostname;
          errorMsg = `DNS error: Cannot resolve hostname "${hostname}". This could mean:\n` +
            `1. The hostname is incorrect - check IBKR_FLEX_BASE_URL in your .env.local\n` +
            `2. You're offline or have DNS issues\n` +
            `3. The correct IBKR Flex endpoint might be different\n\n` +
            `Current base URL: ${baseUrl}\n` +
            `Try: https://www.interactivebrokers.com/Universal/servlet (without "gdcdyn" subdomain)`;
        } else if (fetchError.message.includes('ECONNREFUSED')) {
          errorMsg = `Connection refused to ${baseUrl}. Check if the URL is correct.`;
        }
      }
      
      throw new FlexApiError(
        errorMsg,
        undefined,
        JSON.stringify(errorDetails)
      );
    }

    if (!requestResponse.ok) {
      const errorText = await requestResponse.text();
      console.error('Flex API SendRequest HTTP error:', {
        status: requestResponse.status,
        statusText: requestResponse.statusText,
        headers: Object.fromEntries(requestResponse.headers.entries()),
        errorText: errorText.substring(0, 500),
      });
      throw new FlexApiError(
        `Flex API SendRequest failed: ${requestResponse.status} ${requestResponse.statusText}. ${errorText.substring(0, 200)}`,
        requestResponse.status,
        errorText
      );
    }

    // Parse response to get reference number and URL (if returned)
    const requestText = await requestResponse.text();
    let referenceNumber: string | null = null;
    let getStatementUrl: string | null = null;
    
    // Log response for debugging
    console.log('Flex SendRequest response:', {
      status: requestResponse.status,
      contentType: requestResponse.headers.get('content-type'),
      responseLength: requestText.length,
      responsePreview: requestText.substring(0, 500),
    });
    
    // Check for error in response first
    const errorMatch = requestText.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/i);
    if (errorMatch) {
      throw new FlexApiError(
        `Flex API error: ${errorMatch[1]}`,
        requestResponse.status,
        requestText
      );
    }
    
    // Try to extract reference number from XML response
    // IBKR returns XML like: <FlexStatementResponse><Status>Success</Status><ReferenceCode>123456</ReferenceCode><Url>...</Url></FlexStatementResponse>
    const refMatch = requestText.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/i);
    if (refMatch) {
      referenceNumber = refMatch[1].trim();
      console.log('Extracted reference number:', referenceNumber);
      
      // Extract URL from response - IBKR provides the exact URL to use for GetStatement
      const urlMatch = requestText.match(/<Url>([^<]+)<\/Url>/i);
      if (urlMatch) {
        getStatementUrl = urlMatch[1].trim();
        console.log('Extracted GetStatement URL from response:', getStatementUrl.replace(flexToken, '***REDACTED***'));
      }
    } else {
      // If no reference code and no error, the response might be the CSV directly
      console.warn('No ReferenceCode found in response, trying to use response as CSV');
    }

    // Wait if configured (some Flex queries need time to generate)
    if (apiConfig.waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, apiConfig.waitMs));
    }

    // Step 2: Get the statement/results
    let csv: string;
    let contentType: string;
    
    if (referenceNumber) {
      // Use the URL from IBKR response if provided, but replace gdcdyn with www if needed
      // (gdcdyn doesn't resolve, but www.interactivebrokers.com works)
      let finalGetStatementUrl: string;
      if (getStatementUrl) {
        // URL from response might point to gdcdyn which doesn't resolve
        // Replace it with the working base URL hostname
        let workingUrl = getStatementUrl;
        if (getStatementUrl.includes('gdcdyn.interactivebrokers.com')) {
          // Replace gdcdyn with www (or use the base URL we know works)
          const urlObj = new URL(getStatementUrl);
          const baseUrlObj = new URL(baseUrl);
          urlObj.hostname = baseUrlObj.hostname; // Use hostname from working base URL
          workingUrl = urlObj.toString();
          console.log('Replaced gdcdyn hostname with working base URL hostname');
        }
        
        // Add token and reference parameters
        const urlObj = new URL(workingUrl);
        urlObj.searchParams.set('t', flexToken);
        urlObj.searchParams.set('q', referenceNumber);
        urlObj.searchParams.set('v', '3');
        finalGetStatementUrl = urlObj.toString();
        console.log('Using GetStatement URL (with working hostname)');
      } else {
        // Fallback: construct URL using base URL
        finalGetStatementUrl = `${baseUrl}/FlexStatementService.GetStatement?t=${encodeURIComponent(flexToken)}&q=${encodeURIComponent(referenceNumber)}&v=3`;
        console.log('Constructing GetStatement URL from base URL');
      }
      
      console.log('Fetching statement with reference:', referenceNumber);
      console.log('GetStatement URL:', finalGetStatementUrl.replace(flexToken, '***REDACTED***'));
      
      let csvResponse: Response;
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        try {
          csvResponse = await fetch(finalGetStatementUrl, {
            method: 'GET',
            headers: {
              'Accept': 'text/csv, application/csv, */*',
              'User-Agent': 'TradeJournal/1.0',
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          
          // If DNS error and URL contains gdcdyn, try fallback to www.interactivebrokers.com
          if (fetchError instanceof Error && 
              (fetchError.message.includes('ENOTFOUND') || 
               fetchError.message.includes('getaddrinfo')) &&
              finalGetStatementUrl.includes('gdcdyn.interactivebrokers.com')) {
            console.warn('gdcdyn hostname failed, trying fallback to www.interactivebrokers.com');
            
            // Replace gdcdyn with www while keeping the same path and parameters
            const fallbackUrl = finalGetStatementUrl.replace(
              'gdcdyn.interactivebrokers.com',
              'www.interactivebrokers.com'
            );
            
            console.log('Trying fallback URL:', fallbackUrl.replace(flexToken, '***REDACTED***'));
            
            // Try with fallback URL
            const fallbackController = new AbortController();
            const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 30000);
            
            try {
              csvResponse = await fetch(fallbackUrl, {
                method: 'GET',
                headers: {
                  'Accept': 'text/csv, application/csv, */*',
                  'User-Agent': 'TradeJournal/1.0',
                },
                signal: fallbackController.signal,
              });
              clearTimeout(fallbackTimeoutId);
              console.log('Fallback URL succeeded!');
            } catch (fallbackError) {
              clearTimeout(fallbackTimeoutId);
              // If fallback also fails, throw original error
              throw fetchError;
            }
          } else {
            throw fetchError;
          }
        }
      } catch (fetchError) {
        const errorDetails = fetchError instanceof Error 
          ? {
              name: fetchError.name,
              message: fetchError.message,
              cause: fetchError.cause,
            }
          : fetchError;
        
        console.error('Flex API GetStatement fetch error:', {
          url: finalGetStatementUrl.replace(flexToken, '***REDACTED***'),
          error: errorDetails,
        });
        
        throw new FlexApiError(
          `Network error fetching Flex statement: ${fetchError instanceof Error ? fetchError.message : 'Unknown network error'}`,
          undefined,
          JSON.stringify(errorDetails)
        );
      }

      if (!csvResponse.ok) {
        const errorText = await csvResponse.text();
        console.error('GetStatement failed:', {
          status: csvResponse.status,
          statusText: csvResponse.statusText,
          error: errorText.substring(0, 500),
        });
        throw new FlexApiError(
          `Flex API GetStatement failed: ${csvResponse.status} ${csvResponse.statusText}. ${errorText.substring(0, 200)}`,
          csvResponse.status,
          errorText
        );
      }

      contentType = csvResponse.headers.get('content-type') || 'text/csv';
      csv = await csvResponse.text();
    } else {
      // No reference number - check if SendRequest returned CSV directly
      // Some queries return CSV immediately without needing GetStatement
      if (requestText.includes('HEADER,') || requestText.includes('DATA,')) {
        // Looks like CSV was returned directly
        console.log('CSV returned directly from SendRequest');
        csv = requestText;
        contentType = 'text/csv';
      } else {
        // Try GetStatement with original query ID (some endpoints work this way)
        const getStatementUrl = `${apiConfig.baseUrl}/FlexStatementService.GetStatement?t=${encodeURIComponent(flexToken)}&q=${encodeURIComponent(queryId)}&v=3`;
        
        console.log('Trying GetStatement with query ID:', queryId);
        
        let csvResponse: Response;
        try {
          csvResponse = await fetch(getStatementUrl, {
            method: 'GET',
            headers: {
              'Accept': 'text/csv, application/csv, */*',
              'User-Agent': 'TradeJournal/1.0',
            },
            signal: AbortSignal.timeout(30000), // 30 second timeout
          });
        } catch (fetchError) {
          const errorDetails = fetchError instanceof Error 
            ? {
                name: fetchError.name,
                message: fetchError.message,
                cause: fetchError.cause,
              }
            : fetchError;
          
          console.error('Flex API GetStatement fetch error:', {
            url: getStatementUrl.replace(flexToken, '***REDACTED***'),
            error: errorDetails,
          });
          
          throw new FlexApiError(
            `Network error fetching Flex statement: ${fetchError instanceof Error ? fetchError.message : 'Unknown network error'}`,
            undefined,
            JSON.stringify(errorDetails)
          );
        }

        if (!csvResponse.ok) {
          const errorText = await csvResponse.text();
          console.error('GetStatement with query ID failed:', {
            status: csvResponse.status,
            statusText: csvResponse.statusText,
            error: errorText.substring(0, 500),
          });
          throw new FlexApiError(
            `Flex API failed: ${csvResponse.status} ${csvResponse.statusText}. SendRequest response: ${requestText.substring(0, 200)}. GetStatement error: ${errorText.substring(0, 200)}`,
            csvResponse.status,
            errorText
          );
        }

        contentType = csvResponse.headers.get('content-type') || 'text/csv';
        csv = await csvResponse.text();
      }
    }

    // Validate that we got CSV content
    if (!csv || csv.trim().length === 0) {
      throw new FlexApiError('Empty response from Flex API');
    }

    // Check if response is an error message (IBKR sometimes returns HTML error pages)
    if (csv.includes('<html>') || csv.toLowerCase().includes('error') || csv.toLowerCase().includes('invalid')) {
      throw new FlexApiError('Flex API returned an error page instead of CSV data', csvResponse.status, csv);
    }

    return { csv, contentType };
  } catch (error) {
    if (error instanceof FlexApiError) {
      throw error;
    }

    throw new FlexApiError(
      `Failed to fetch Flex query: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validates Flex query configuration
 * Checks if required values are provided either in config or environment variables
 */
export function validateFlexConfig(config: Partial<FlexQueryConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const apiConfig = getFlexApiConfig();

  // Token is required (either in config or env)
  if (!config.flexToken || config.flexToken.trim().length === 0) {
    if (!apiConfig.defaultToken) {
      errors.push('FLEX_TOKEN is required (provide in config or set IBKR_FLEX_TOKEN environment variable)');
    }
  }

  // Query ID is required (either in config or env based on query type)
  if (!config.queryId || config.queryId.trim().length === 0) {
    if (config.queryType === 'positions' && !apiConfig.defaultPositionsQueryId) {
      errors.push('QUERY_ID is required for positions query (provide in config or set IBKR_FLEX_POSITIONS_QUERY_ID environment variable)');
    } else if (config.queryType === 'trades' && !apiConfig.defaultTradesQueryId) {
      errors.push('QUERY_ID is required for trades query (provide in config or set IBKR_FLEX_TRADES_QUERY_ID environment variable)');
    } else if (!config.queryType) {
      errors.push('QUERY_ID is required (provide in config or set IBKR_FLEX_POSITIONS_QUERY_ID/IBKR_FLEX_TRADES_QUERY_ID environment variable)');
    }
  }

  if (config.queryType && !['positions', 'trades'].includes(config.queryType)) {
    errors.push('queryType must be "positions" or "trades"');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

