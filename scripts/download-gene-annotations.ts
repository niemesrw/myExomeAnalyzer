#!/usr/bin/env npx tsx
import { GeneAnnotationManager } from './src/annotation/gene-annotation-manager';
import chalk from 'chalk';

async function downloadGeneAnnotations() {
  try {
    console.log(chalk.blue('🧬 Starting GENCODE gene annotation download...'));
    
    const manager = new GeneAnnotationManager('tiledb_workspace');
    
    // Check current status
    const status = manager.getDownloadStatus();
    console.log(chalk.gray('Current status:'));
    console.log(chalk.gray(`  GTF exists: ${status.gtfExists}`));
    if (status.gtfSize) {
      console.log(chalk.gray(`  GTF size: ${status.gtfSize}`));
    }
    console.log(chalk.gray(`  Version: GENCODE v${status.downloadConfig.version}`));
    console.log(chalk.gray(`  Type: ${status.downloadConfig.annotation_type}`));
    console.log();
    
    // Download annotations
    await manager.downloadGeneAnnotations();
    
    // Parse and get summary
    console.log();
    console.log(chalk.blue('📊 Parsing gene annotations...'));
    const annotations = await manager.parseGeneAnnotations();
    const geneRegions = manager.extractGeneRegions(annotations);
    
    console.log();
    console.log(chalk.green('✅ Gene annotation summary:'));
    console.log(`  Total annotations: ${annotations.length.toLocaleString()}`);
    console.log(`  Unique genes: ${geneRegions.length.toLocaleString()}`);
    console.log(`  Protein-coding genes: ${manager.getGenesByType(geneRegions, 'protein_coding').length.toLocaleString()}`);
    console.log(`  Clinical genes: ${manager.getClinicalGenes(geneRegions).length.toLocaleString()}`);
    
    // Show some clinical genes
    const clinicalGenes = manager.getClinicalGenes(geneRegions);
    console.log();
    console.log(chalk.blue('🏥 Examples of clinical genes found:'));
    clinicalGenes.slice(0, 10).forEach(gene => {
      console.log(`  ${gene.gene_name} (chr${gene.chrom}:${gene.start.toLocaleString()}-${gene.end.toLocaleString()}) - ${gene.clinical_significance}`);
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  }
}

downloadGeneAnnotations();