/**
 * Research Ingestion Service
 *
 * Handles ingestion of research content from various sources:
 * - Manual text input
 * - URL content fetching
 * - File uploads (future)
 */

import { createResearchArtifact } from '@/db/queries/research';
import type { NewResearchArtifact } from '@/db/schema';
import { RESEARCH_SOURCE_TYPES, type ResearchSourceType } from '@/lib/research/sourceTypes';

// Re-export the canonical source-type list so existing importers can reach it here.
export { RESEARCH_SOURCE_TYPES, type ResearchSourceType };

export interface IngestTextOptions {
  title: string;
  content: string;
  sourceType: ResearchSourceType | 'thread';
  sourceUrl?: string;
  author?: string;
  publishedDate?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface IngestUrlOptions {
  url: string;
  sourceType: 'article' | 'transcript' | 'report' | 'video' | 'thread';
  title?: string;
  author?: string;
  publishedDate?: string;
  tags?: string[];
}

/**
 * Ingest manual text content
 */
export async function ingestText(options: IngestTextOptions): Promise<string> {
  const artifactData: NewResearchArtifact = {
    sourceType: options.sourceType,
    title: options.title,
    rawContent: options.content,
    sourceUrl: options.sourceUrl || null,
    author: options.author || null,
    publishedDate: options.publishedDate || null,
    contentFormat: 'text',
    tags: options.tags || null,
    metadata: options.metadata || null,
    status: 'raw',
  };

  return await createResearchArtifact(artifactData);
}

/**
 * Fetch and ingest content from URL
 */
export async function ingestFromUrl(options: IngestUrlOptions): Promise<string> {
  try {
    // Fetch content from URL
    const response = await fetch(options.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let content = '';
    let extractedTitle = options.title || '';
    let extractedAuthor = options.author || '';

    if (contentType.includes('text/html')) {
      const html = await response.text();

      // Basic HTML parsing to extract content and metadata
      // Remove script and style tags
      let cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      cleanHtml = cleanHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

      // Extract title if not provided
      if (!extractedTitle) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          extractedTitle = titleMatch[1].trim();
        }
      }

      // Extract meta author if not provided
      if (!extractedAuthor) {
        const authorMatch = html.match(
          /<meta\s+(?:name|property)=["'](?:author|article:author)["']\s+content=["']([^"']+)["']/i
        );
        if (authorMatch) {
          extractedAuthor = authorMatch[1].trim();
        }
      }

      // Strip all HTML tags to get text content
      content = cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } else if (contentType.includes('text/plain')) {
      content = await response.text();
    } else {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    if (!content) {
      throw new Error('No content extracted from URL');
    }

    if (!extractedTitle) {
      extractedTitle = options.url;
    }

    const artifactData: NewResearchArtifact = {
      sourceType: options.sourceType,
      sourceUrl: options.url,
      title: extractedTitle,
      author: extractedAuthor || null,
      publishedDate: options.publishedDate || null,
      rawContent: content,
      contentFormat: contentType.includes('text/html') ? 'html' : 'text',
      tags: options.tags || null,
      metadata: {
        contentType,
        urlFetchedAt: new Date().toISOString(),
      },
      status: 'raw',
    };

    return await createResearchArtifact(artifactData);
  } catch (error) {
    console.error('Error ingesting from URL:', error);
    throw error;
  }
}

/**
 * Extract metadata from research content
 * Basic implementation - can be enhanced with AI/NLP in Phase 2.3
 */
export function extractMetadata(content: string): {
  wordCount: number;
  estimatedReadingMinutes: number;
  hasNumbers: boolean;
  hasDates: boolean;
} {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const estimatedReadingMinutes = Math.max(1, Math.ceil(wordCount / 200)); // ~200 words per minute

  // Check for numbers (potential data/metrics)
  const hasNumbers = /\d+/.test(content);

  // Check for dates (potential time-relevant content)
  const hasDates =
    /\d{4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i.test(content);

  return {
    wordCount,
    estimatedReadingMinutes,
    hasNumbers,
    hasDates,
  };
}

/**
 * Validate research artifact data before ingestion
 */
export function validateResearchData(data: Partial<IngestTextOptions>): string[] {
  const errors: string[] = [];

  if (!data.title || data.title.trim().length === 0) {
    errors.push('Title is required');
  }

  if (!data.content || data.content.trim().length === 0) {
    errors.push('Content is required');
  }

  if (!data.sourceType) {
    errors.push('Source type is required');
  } else {
    const validSourceTypes = [...RESEARCH_SOURCE_TYPES, 'thread'];
    if (!validSourceTypes.includes(data.sourceType)) {
      errors.push(`Invalid source type. Must be one of: ${validSourceTypes.join(', ')}`);
    }
  }

  if (data.content && data.content.length > 1000000) {
    // 1MB limit for text content
    errors.push('Content exceeds maximum size (1MB)');
  }

  return errors;
}
