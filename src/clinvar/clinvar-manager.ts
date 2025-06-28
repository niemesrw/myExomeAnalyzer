import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export interface ClinVarVariant {
  variant_id: string;
  chrom: string;
  pos: number;
  ref: string;
  alt: string;
  clinical_significance: string;
  review_status: string;
  condition: string;
  gene_symbol: string;
  molecular_consequence: string;
  origin: string;
  last_evaluated: string;
  url: string;
  variation_type: string;
  assembly: string;
}

export interface ClinVarStats {
  total_variants: number;
  pathogenic: number;
  benign: number;
  vus: number; // Variant of Uncertain Significance
  likely_pathogenic: number;
  likely_benign: number;
  conflicting: number;
  reviewed_variants: number;
  expert_reviewed: number;
}

export class ClinVarManager {
  private workspacePath: string;
  private clinvarDir: string;
  private arraysDir: string;
  private clinvarArray: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.clinvarDir = path.join(workspacePath, 'clinvar_data');
    this.arraysDir = path.join(workspacePath, 'clinvar_arrays');
    this.clinvarArray = path.join(this.arraysDir, 'clinvar_variants');
    
    // Ensure directories exist
    fs.mkdirSync(this.clinvarDir, { recursive: true });
    fs.mkdirSync(this.arraysDir, { recursive: true });
  }

  /**
   * Download ClinVar VCF file
   */
  async downloadClinVarData(): Promise<void> {
    console.log(chalk.blue('📥 Downloading ClinVar variant data...'));
    
    const vcfFile = path.join(this.clinvarDir, 'clinvar.vcf.gz');
    const tbiFile = path.join(this.clinvarDir, 'clinvar.vcf.gz.tbi');
    
    // Skip if already downloaded
    if (fs.existsSync(vcfFile)) {
      console.log(chalk.yellow(`⏭️  ClinVar VCF already exists: ${path.basename(vcfFile)}`));
      return;
    }

    try {
      // ClinVar VCF from NCBI FTP
      const vcfUrl = 'https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/clinvar.vcf.gz';
      const tbiUrl = 'https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/clinvar.vcf.gz.tbi';
      
      console.log(chalk.gray('Downloading ClinVar VCF (GRCh38)...'));
      console.log(chalk.gray(`URL: ${vcfUrl}`));
      
      // Download VCF file
      const vcfCommand = `curl -L -o "${vcfFile}" --progress-bar "${vcfUrl}"`;
      execSync(vcfCommand, { stdio: 'inherit' });
      
      // Download index file
      const tbiCommand = `curl -L -o "${tbiFile}" --progress-bar "${tbiUrl}"`;
      execSync(tbiCommand, { stdio: 'inherit' });

      // Verify downloads
      if (fs.existsSync(vcfFile) && fs.existsSync(tbiFile)) {
        const vcfStats = fs.statSync(vcfFile);
        const tbiStats = fs.statSync(tbiFile);
        console.log(chalk.green(`✅ Downloaded ClinVar data:`));
        console.log(`   VCF: ${(vcfStats.size / 1024 / 1024).toFixed(1)} MB`);
        console.log(`   Index: ${(tbiStats.size / 1024).toFixed(1)} KB`);
      } else {
        throw new Error('Download verification failed');
      }

    } catch (error) {
      console.error(chalk.red(`❌ Failed to download ClinVar data:`), error);
      throw error;
    }
  }

  /**
   * Process ClinVar VCF and create TileDB array
   */
  async processClinVarData(): Promise<void> {
    console.log(chalk.blue('📊 Processing ClinVar VCF data...'));
    
    const vcfFile = path.join(this.clinvarDir, 'clinvar.vcf.gz');
    
    if (!fs.existsSync(vcfFile)) {
      throw new Error(`ClinVar VCF not found: ${vcfFile}. Run downloadClinVarData() first.`);
    }

    try {
      // Call Python processor
      const pythonScript = path.join(process.cwd(), 'src', 'clinvar', 'clinvar-processor.py');
      const command = `python "${pythonScript}" "${this.workspacePath}"`;
      
      console.log(chalk.gray('Starting ClinVar processing...'));
      execSync(command, { stdio: 'inherit', cwd: process.cwd() });
      
      console.log(chalk.green('✅ ClinVar processing completed'));
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to process ClinVar data:'), error);
      throw error;
    }
  }

  /**
   * Query ClinVar for a specific variant
   */
  async queryClinVar(chrom: string, pos: number, ref: string, alt: string): Promise<ClinVarVariant | null> {
    // This will be implemented once TileDB array is created
    console.log(`Querying ClinVar for chr${chrom}:${pos} ${ref}>${alt}`);
    // For now, return null - will be implemented after processing
    return null;
  }

  /**
   * Get ClinVar statistics
   */
  async getClinVarStats(): Promise<ClinVarStats> {
    // This will be implemented once TileDB array is created
    return {
      total_variants: 0,
      pathogenic: 0,
      benign: 0,
      vus: 0,
      likely_pathogenic: 0,
      likely_benign: 0,
      conflicting: 0,
      reviewed_variants: 0,
      expert_reviewed: 0
    };
  }

  /**
   * Find pathogenic variants in a gene
   */
  async findPathogenicVariants(geneSymbol: string, limit: number = 100): Promise<ClinVarVariant[]> {
    // This will be implemented once TileDB array is created
    console.log(`Finding pathogenic variants in ${geneSymbol} (limit: ${limit})`);
    return [];
  }

  /**
   * Get download and processing status
   */
  getStatus(): {
    vcfExists: boolean;
    vcfSize?: string;
    arrayExists: boolean;
    vcfPath?: string;
    arrayPath?: string;
  } {
    const vcfFile = path.join(this.clinvarDir, 'clinvar.vcf.gz');
    const vcfExists = fs.existsSync(vcfFile);
    const arrayExists = fs.existsSync(this.clinvarArray);
    
    let vcfSize: string | undefined;
    if (vcfExists) {
      const stats = fs.statSync(vcfFile);
      vcfSize = `${(stats.size / 1024 / 1024).toFixed(1)} MB`;
    }
    
    return {
      vcfExists,
      vcfSize,
      arrayExists,
      vcfPath: vcfExists ? vcfFile : undefined,
      arrayPath: arrayExists ? this.clinvarArray : undefined
    };
  }

  private chromosomeToInt(chrom: string): number {
    chrom = chrom.replace('chr', '');
    if (chrom === 'X') return 23;
    if (chrom === 'Y') return 24;
    if (chrom === 'MT' || chrom === 'M') return 25;
    return parseInt(chrom);
  }

  private intToChromosome(chromInt: number): string {
    if (chromInt === 23) return 'X';
    if (chromInt === 24) return 'Y';
    if (chromInt === 25) return 'MT';
    return chromInt.toString();
  }
}