#!/usr/bin/env npx tsx
import { ClinVarManager } from './src/clinvar/clinvar-manager';
import chalk from 'chalk';

async function downloadClinVar() {
  try {
    console.log(chalk.blue('🏥 Starting ClinVar download...'));
    
    const manager = new ClinVarManager('tiledb_workspace');
    
    // Check current status
    const status = manager.getStatus();
    console.log(chalk.gray('Current status:'));
    console.log(chalk.gray(`  VCF exists: ${status.vcfExists}`));
    if (status.vcfSize) {
      console.log(chalk.gray(`  VCF size: ${status.vcfSize}`));
    }
    console.log();
    
    // Download ClinVar data
    await manager.downloadClinVarData();
    
    console.log();
    console.log(chalk.green('✅ ClinVar download completed!'));
    console.log(chalk.blue('Next step: Run "npm run analyze -- clinvar process" to create TileDB arrays'));
    
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  }
}

downloadClinVar();