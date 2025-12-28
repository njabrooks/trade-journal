#!/usr/bin/env node
/**
 * Validate Templates Skill
 *
 * Validates and fixes Obsidian markdown template issues
 */

import { execSync } from 'child_process';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../../..');

async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args.includes('--validate-only');

  console.log('🔍 Validating Obsidian markdown templates...\n');

  // Step 1: Run validation
  console.log('Step 1: Running validation...\n');
  try {
    execSync('npx tsx scripts/validate-obsidian-templates.ts', {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    console.log('\n✅ All files are valid!\n');
    process.exit(0);
  } catch (error) {
    console.log('\n⚠️  Validation found issues\n');
  }

  if (validateOnly) {
    console.log('Validation complete (--validate-only mode)\n');
    process.exit(0);
  }

  // Step 2: Apply fixes
  console.log('Step 2: Applying auto-fixes...\n');
  try {
    execSync('npx tsx scripts/fix-obsidian-templates-simple.ts', {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Error applying fixes:', error);
    process.exit(1);
  }

  // Step 3: Re-validate
  console.log('\nStep 3: Re-validating...\n');
  try {
    execSync('npx tsx scripts/validate-obsidian-templates.ts', {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    console.log('\n✅ All issues resolved!\n');
  } catch (error) {
    console.log('\n⚠️  Some issues remain (may require manual fixes)\n');
  }
}

main().catch(console.error);
