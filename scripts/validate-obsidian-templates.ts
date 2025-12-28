#!/usr/bin/env tsx
/**
 * Validate Obsidian markdown files against templates
 *
 * This script:
 * 1. Scans Obsidian vault for markdown files
 * 2. Validates frontmatter against template schemas
 * 3. Checks body structure
 * 4. Reports validation errors and warnings
 *
 * Usage:
 *   npx tsx scripts/validate-obsidian-templates.ts
 */

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { parseMarkdown } from '@/lib/obsidian/markdown';

interface ValidationError {
  file: string;
  type: 'error' | 'warning';
  field?: string;
  message: string;
}

interface ValidationResult {
  file: string;
  entityType: string;
  errors: ValidationError[];
  warnings: ValidationError[];
  valid: boolean;
}

// Template schemas
const MAIN_CLAIM_REQUIRED = ['id', 'type', 'category', 'status', 'created_at', 'updated_at'];
const MACRO_THESIS_REQUIRED = ['id', 'type', 'thesis_type', 'created_at', 'updated_at'];
const ASSET_VIEW_REQUIRED = ['id', 'type', 'ticker', 'created_at', 'updated_at'];
const RESEARCH_ARTIFACT_REQUIRED = ['id', 'type', 'source_type', 'title', 'created_at', 'updated_at'];

const VALID_ENUMS = {
  category: ['macro', 'asset_specific'],
  status: ['active', 'invalidated', 'merged', 'under_review', 'retired', 'superseded'],
  confidence: ['high', 'medium', 'low', 'exploratory'],
  time_horizon: ['long_term', 'medium_term', 'short_term'],
  thesis_type: ['secular', 'cyclical', 'structural'],
  direction: ['bullish', 'bearish', 'neutral'],
  outcome: ['validated', 'invalidated', 'partial', 'ongoing'],
  confidence_level: ['high', 'medium', 'low', 'exploratory'],
  source_type: ['transcript', 'article', 'podcast', 'video', 'paper', 'note'],
};

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip .templates and other hidden directories
        if (!entry.name.startsWith('.')) {
          files.push(...(await findMarkdownFiles(fullPath)));
        }
      } else if (entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or not accessible
  }

  return files;
}

function validateFrontmatter(
  frontmatter: any,
  entityType: string
): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Get required fields based on entity type
  let requiredFields: string[] = [];
  if (entityType === 'main_claim') {
    requiredFields = MAIN_CLAIM_REQUIRED;
  } else if (entityType === 'macro_thesis') {
    requiredFields = MACRO_THESIS_REQUIRED;
  } else if (entityType === 'asset_view') {
    requiredFields = ASSET_VIEW_REQUIRED;
  } else if (entityType === 'research_artifact') {
    requiredFields = RESEARCH_ARTIFACT_REQUIRED;
  }

  // Check required fields
  for (const field of requiredFields) {
    if (!frontmatter[field]) {
      errors.push({
        file: '',
        type: 'error',
        field,
        message: `Required field '${field}' is missing or empty`,
      });
    }
  }

  // Validate enum fields
  for (const [field, validValues] of Object.entries(VALID_ENUMS)) {
    if (frontmatter[field] && !validValues.includes(frontmatter[field])) {
      errors.push({
        file: '',
        type: 'error',
        field,
        message: `Invalid value '${frontmatter[field]}' for '${field}'. Must be one of: ${validValues.join(', ')}`,
      });
    }
  }

  // Check date formats
  const dateFields = ['created_at', 'updated_at', 'last_synced_at', 'position_start_date', 'position_end_date', 'published_date'];
  for (const field of dateFields) {
    if (frontmatter[field]) {
      const value = frontmatter[field];
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
      const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

      if (!iso8601Regex.test(value) && !dateOnlyRegex.test(value)) {
        warnings.push({
          file: '',
          type: 'warning',
          field,
          message: `Date field '${field}' has invalid format: '${value}'. Should be ISO 8601 or YYYY-MM-DD`,
        });
      }
    }
  }

  // Entity-specific validations
  if (entityType === 'asset_view') {
    if (!frontmatter.ticker || frontmatter.ticker === 'undefined') {
      errors.push({
        file: '',
        type: 'error',
        field: 'ticker',
        message: 'Asset view must have a valid ticker symbol',
      });
    }
  }

  if (entityType === 'macro_thesis') {
    if (frontmatter.notes && typeof frontmatter.notes === 'object') {
      warnings.push({
        file: '',
        type: 'warning',
        field: 'notes',
        message: 'Notes field is an object - should be a string. Will render as [object Object]',
      });
    }
  }

  // Check for undefined values
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === 'undefined' || value === undefined) {
      warnings.push({
        file: '',
        type: 'warning',
        field: key,
        message: `Field '${key}' has value 'undefined'`,
      });
    }
  }

  return { errors, warnings };
}

function validateBody(content: string, entityType: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check for required headings based on entity type
  const requiredHeadings: { [key: string]: string[] } = {
    main_claim: ['# ', '## Claim'],
    macro_thesis: ['# ', '## Rationale Summary'],
    asset_view: ['# ', '## Description'],
  };

  const required = requiredHeadings[entityType] || [];
  for (const heading of required) {
    if (!content.includes(heading)) {
      errors.push({
        file: '',
        type: 'error',
        message: `Missing required heading: '${heading}'`,
      });
    }
  }

  // Check for "undefined" or "[object Object]" in body
  if (content.includes('undefined')) {
    warnings.push({
      file: '',
      type: 'warning',
      message: 'Body contains "undefined" - likely a template rendering issue',
    });
  }

  if (content.includes('[object Object]')) {
    warnings.push({
      file: '',
      type: 'warning',
      message: 'Body contains "[object Object]" - JSONB field not properly serialized',
    });
  }

  return { errors, warnings };
}

async function validateFile(filePath: string): Promise<ValidationResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, content: bodyContent } = parseMarkdown(content);

    const entityType = frontmatter.type || 'unknown';

    const frontmatterValidation = validateFrontmatter(frontmatter, entityType);
    const bodyValidation = validateBody(bodyContent, entityType);

    const errors = [
      ...frontmatterValidation.errors.map(e => ({ ...e, file: filePath })),
      ...bodyValidation.errors.map(e => ({ ...e, file: filePath })),
    ];

    const warnings = [
      ...frontmatterValidation.warnings.map(w => ({ ...w, file: filePath })),
      ...bodyValidation.warnings.map(w => ({ ...w, file: filePath })),
    ];

    return {
      file: filePath,
      entityType,
      errors,
      warnings,
      valid: errors.length === 0,
    };
  } catch (error) {
    return {
      file: filePath,
      entityType: 'unknown',
      errors: [{
        file: filePath,
        type: 'error',
        message: `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
      warnings: [],
      valid: false,
    };
  }
}

async function main() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH || '/Users/njb/Desktop/nick/investing';

  console.log('🔍 Validating Obsidian markdown templates...\n');
  console.log(`Vault path: ${vaultPath}\n`);

  // Find all markdown files
  const files = await findMarkdownFiles(vaultPath);
  console.log(`Found ${files.length} markdown files\n`);

  // Validate each file
  const results: ValidationResult[] = [];
  for (const file of files) {
    const result = await validateFile(file);
    results.push(result);
  }

  // Summary statistics
  const validCount = results.filter(r => r.valid).length;
  const invalidCount = results.filter(r => !r.valid).length;
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

  // Group by entity type
  const byType: { [key: string]: ValidationResult[] } = {};
  for (const result of results) {
    if (!byType[result.entityType]) {
      byType[result.entityType] = [];
    }
    byType[result.entityType].push(result);
  }

  // Print results
  console.log('═══════════════════════════════════════════════════════════');
  console.log('VALIDATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`✅ Valid files: ${validCount}`);
  console.log(`❌ Invalid files: ${invalidCount}`);
  console.log(`🔴 Total errors: ${totalErrors}`);
  console.log(`🟡 Total warnings: ${totalWarnings}\n`);

  // Print by entity type
  console.log('By Entity Type:');
  for (const [type, typeResults] of Object.entries(byType)) {
    const typeValid = typeResults.filter(r => r.valid).length;
    const typeInvalid = typeResults.filter(r => !r.valid).length;
    console.log(`  ${type}: ${typeValid} valid, ${typeInvalid} invalid`);
  }
  console.log('');

  // Print detailed errors
  if (invalidCount > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ERRORS');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (const result of results) {
      if (result.errors.length > 0) {
        const relativePath = result.file.replace(vaultPath, '');
        console.log(`📄 ${relativePath}`);
        console.log(`   Type: ${result.entityType}`);

        for (const error of result.errors) {
          if (error.field) {
            console.log(`   ❌ [${error.field}] ${error.message}`);
          } else {
            console.log(`   ❌ ${error.message}`);
          }
        }
        console.log('');
      }
    }
  }

  // Print warnings
  if (totalWarnings > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('WARNINGS');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (const result of results) {
      if (result.warnings.length > 0) {
        const relativePath = result.file.replace(vaultPath, '');
        console.log(`📄 ${relativePath}`);
        console.log(`   Type: ${result.entityType}`);

        for (const warning of result.warnings) {
          if (warning.field) {
            console.log(`   🟡 [${warning.field}] ${warning.message}`);
          } else {
            console.log(`   🟡 ${warning.message}`);
          }
        }
        console.log('');
      }
    }
  }

  // Exit code
  process.exit(invalidCount > 0 ? 1 : 0);
}

main().catch(console.error);
