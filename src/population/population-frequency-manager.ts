import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export interface PopulationFrequency {
  chrom: string;
  pos: number;
  ref: string;
  alt: string;
  af_global: number;
  af_afr: number;
  af_amr: number;
  af_asj: number;
  af_eas: number;
  af_fin: number;
  af_nfe: number;
  af_oth: number;
  ac_global: number;
  an_global: number;
  nhomalt_global: number;
  faf95_global: number; // Filtering allele frequency at 95% confidence
  is_common: boolean; // True if AF > 1%
}

export interface GnomadDownloadConfig {
  version: string; // e.g., "v4.1"
  chromosomes: string[];
  dataType: 'exomes' | 'genomes' | 'joint';
  outputDir: string;
  cloudProvider: 'aws' | 'gcp';
}

export class PopulationFrequencyManager {
  private workspacePath: string;
  private downloadConfig: GnomadDownloadConfig;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.downloadConfig = {
      version: 'v4.1',
      chromosomes: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', 'X', 'Y'],
      dataType: 'joint', // Combined exomes + genomes for v4.1
      outputDir: path.join(workspacePath, 'gnomad_data'),
      cloudProvider: 'aws'
    };
  }

  /**
   * Download gnomAD frequency data from cloud providers
   */
  async downloadGnomadData(chromosomes?: string[]): Promise<void> {
    const chromsToDownload = chromosomes || this.downloadConfig.chromosomes;
    
    console.log(chalk.blue('🧬 Starting gnomAD v4.1 Population Frequency Download'));
    console.log(chalk.gray(`Downloading ${chromsToDownload.length} chromosomes to ${this.downloadConfig.outputDir}`));

    // Create output directory
    if (!fs.existsSync(this.downloadConfig.outputDir)) {
      fs.mkdirSync(this.downloadConfig.outputDir, { recursive: true });
    }

    for (const chrom of chromsToDownload) {
      await this.downloadChromosomeData(chrom);
    }

    console.log(chalk.green('✅ gnomAD download completed'));
  }

  /**
   * Download gnomAD data for a specific chromosome
   */
  private async downloadChromosomeData(chromosome: string): Promise<void> {
    const filename = `gnomad.joint.v4.1.sites.chr${chromosome}.vcf.bgz`;
    const outputPath = path.join(this.downloadConfig.outputDir, filename);

    // Skip if already downloaded
    if (fs.existsSync(outputPath)) {
      console.log(chalk.yellow(`⏭️  Chromosome ${chromosome} already downloaded`));
      return;
    }

    console.log(chalk.blue(`📥 Downloading chromosome ${chromosome}...`));

    try {
      let downloadUrl: string;
      
      if (this.downloadConfig.cloudProvider === 'aws') {
        // AWS S3 bucket (Registry of Open Data)
        downloadUrl = `s3://gnomad-public-us-east-1/release/4.1/vcf/joint/gnomad.joint.v4.1.sites.chr${chromosome}.vcf.bgz`;
        
        // Use AWS CLI to download
        const command = `aws s3 cp "${downloadUrl}" "${outputPath}" --no-sign-request`;
        execSync(command, { stdio: 'inherit' });
        
      } else if (this.downloadConfig.cloudProvider === 'gcp') {
        // Google Cloud Storage bucket
        downloadUrl = `gs://gcp-public-data--gnomad/release/4.1/vcf/joint/gnomad.joint.v4.1.sites.chr${chromosome}.vcf.bgz`;
        
        // Use gsutil to download
        const command = `gsutil cp "${downloadUrl}" "${outputPath}"`;
        execSync(command, { stdio: 'inherit' });
      }

      // Verify download
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(chalk.green(`✅ Downloaded chr${chromosome} (${(stats.size / 1024 / 1024 / 1024).toFixed(2)} GB)`));
      } else {
        throw new Error(`Download failed - file not found: ${outputPath}`);
      }

    } catch (error) {
      console.error(chalk.red(`❌ Failed to download chromosome ${chromosome}:`), error);
      throw error;
    }
  }

  /**
   * Check if required tools are installed
   */
  checkRequiredTools(): { aws: boolean; gcp: boolean; tabix: boolean } {
    const tools = {
      aws: this.isCommandAvailable('aws'),
      gcp: this.isCommandAvailable('gsutil'),
      tabix: this.isCommandAvailable('tabix')
    };

    console.log(chalk.blue('🔍 Checking required tools:'));
    console.log(`  AWS CLI: ${tools.aws ? chalk.green('✓') : chalk.red('✗')}`);
    console.log(`  Google Cloud CLI: ${tools.gcp ? chalk.green('✓') : chalk.red('✗')}`);
    console.log(`  Tabix: ${tools.tabix ? chalk.green('✓') : chalk.red('✗')}`);

    return tools;
  }

  private isCommandAvailable(command: string): boolean {
    try {
      execSync(`which ${command}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Install AWS CLI if not available (macOS)
   */
  async installAWSCLI(): Promise<void> {
    console.log(chalk.blue('📦 Installing AWS CLI...'));
    
    try {
      // Check if Homebrew is available
      if (this.isCommandAvailable('brew')) {
        execSync('brew install awscli', { stdio: 'inherit' });
      } else {
        console.log(chalk.yellow('💡 Please install AWS CLI manually:'));
        console.log('  brew install awscli');
        console.log('  OR download from: https://aws.amazon.com/cli/');
        throw new Error('Homebrew not available for automatic installation');
      }
      
      console.log(chalk.green('✅ AWS CLI installed successfully'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to install AWS CLI:'), error);
      throw error;
    }
  }

  /**
   * Get download status and disk space requirements
   */
  getDownloadInfo(): { estimatedSize: string; diskSpace: string; status: string } {
    const estimatedSizeGB = this.downloadConfig.chromosomes.length * 2.5; // ~2.5GB per chromosome
    const availableSpace = this.getAvailableDiskSpace();
    
    return {
      estimatedSize: `~${estimatedSizeGB.toFixed(1)} GB`,
      diskSpace: `${(availableSpace / 1024 / 1024 / 1024).toFixed(1)} GB available`,
      status: availableSpace > estimatedSizeGB * 1024 * 1024 * 1024 ? 'sufficient' : 'insufficient'
    };
  }

  private getAvailableDiskSpace(): number {
    try {
      const stats = fs.statSync(this.workspacePath);
      // This is a simplified check - in practice you'd use statvfs or similar
      return 100 * 1024 * 1024 * 1024; // Assume 100GB available for now
    } catch {
      return 0;
    }
  }

  /**
   * List downloaded files and their status
   */
  listDownloadedFiles(): { chromosome: string; size: string; downloaded: boolean }[] {
    const results: { chromosome: string; size: string; downloaded: boolean }[] = [];
    
    for (const chrom of this.downloadConfig.chromosomes) {
      const filename = `gnomad.joint.v4.1.sites.chr${chrom}.vcf.bgz`;
      const filePath = path.join(this.downloadConfig.outputDir, filename);
      
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        results.push({
          chromosome: chrom,
          size: `${(stats.size / 1024 / 1024 / 1024).toFixed(2)} GB`,
          downloaded: true
        });
      } else {
        results.push({
          chromosome: chrom,
          size: 'Not downloaded',
          downloaded: false
        });
      }
    }
    
    return results;
  }

  /**
   * Clean up downloaded files to save space
   */
  cleanupDownloads(keepChromosomes?: string[]): void {
    const keep = keepChromosomes || [];
    
    console.log(chalk.blue('🧹 Cleaning up gnomAD downloads...'));
    
    for (const chrom of this.downloadConfig.chromosomes) {
      if (!keep.includes(chrom)) {
        const filename = `gnomad.joint.v4.1.sites.chr${chrom}.vcf.bgz`;
        const filePath = path.join(this.downloadConfig.outputDir, filename);
        
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(chalk.gray(`🗑️  Removed chr${chrom}`));
        }
      }
    }
    
    console.log(chalk.green('✅ Cleanup completed'));
  }
}