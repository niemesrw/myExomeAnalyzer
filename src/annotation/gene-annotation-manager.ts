import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export interface GeneAnnotation {
  gene_id: string;
  gene_name: string;
  gene_type: string;
  chrom: string;
  start: number;
  end: number;
  strand: '+' | '-';
  source: string;
  transcript_id?: string;
  exon_number?: number;
  feature_type: 'gene' | 'transcript' | 'exon' | 'CDS' | 'UTR';
}

export interface GeneRegion {
  gene_name: string;
  chrom: string;
  start: number;
  end: number;
  gene_type: string;
  strand: '+' | '-';
  transcript_count: number;
  clinical_significance?: string;
}

export interface GTFDownloadConfig {
  version: string; // e.g., "48"
  source: 'gencode' | 'ensembl';
  assembly: 'GRCh38' | 'GRCh37';
  annotation_type: 'basic' | 'comprehensive' | 'primary_assembly';
  outputDir: string;
}

export class GeneAnnotationManager {
  private workspacePath: string;
  private downloadConfig: GTFDownloadConfig;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.downloadConfig = {
      version: '48', // GENCODE v48 (current as of 2024)
      source: 'gencode',
      assembly: 'GRCh38',
      annotation_type: 'basic',
      outputDir: path.join(workspacePath, 'gene_annotations')
    };
  }

  /**
   * Download GENCODE GTF annotation files
   */
  async downloadGeneAnnotations(): Promise<void> {
    console.log(chalk.blue('📥 Downloading GENCODE gene annotations...'));
    
    // Create output directory
    if (!fs.existsSync(this.downloadConfig.outputDir)) {
      fs.mkdirSync(this.downloadConfig.outputDir, { recursive: true });
    }

    const filename = this.getGTFFilename();
    const outputPath = path.join(this.downloadConfig.outputDir, filename);

    // Skip if already downloaded
    if (fs.existsSync(outputPath)) {
      console.log(chalk.yellow(`⏭️  GTF file already exists: ${filename}`));
      return;
    }

    try {
      const downloadUrl = this.getDownloadURL();
      console.log(chalk.gray(`Downloading from: ${downloadUrl}`));
      
      // Use curl to download with progress
      const command = `curl -L -o "${outputPath}" --progress-bar "${downloadUrl}"`;
      execSync(command, { stdio: 'inherit' });

      // Verify download
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(chalk.green(`✅ Downloaded gene annotations (${(stats.size / 1024 / 1024).toFixed(1)} MB)`));
      } else {
        throw new Error(`Download failed - file not found: ${outputPath}`);
      }

    } catch (error) {
      console.error(chalk.red(`❌ Failed to download gene annotations:`), error);
      throw error;
    }
  }

  /**
   * Get the appropriate GTF filename based on configuration
   */
  private getGTFFilename(): string {
    const { version, annotation_type } = this.downloadConfig;
    
    switch (annotation_type) {
      case 'basic':
        return `gencode.v${version}.basic.annotation.gtf.gz`;
      case 'primary_assembly':
        return `gencode.v${version}.primary_assembly.annotation.gtf.gz`;
      case 'comprehensive':
      default:
        return `gencode.v${version}.annotation.gtf.gz`;
    }
  }

  /**
   * Generate the download URL for GENCODE GTF files
   */
  private getDownloadURL(): string {
    const { version } = this.downloadConfig;
    const filename = this.getGTFFilename();
    
    // GENCODE FTP server
    return `ftp://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_${version}/${filename}`;
  }

  /**
   * Parse GTF file and extract gene annotations
   */
  async parseGeneAnnotations(): Promise<GeneAnnotation[]> {
    const gtfFile = path.join(this.downloadConfig.outputDir, this.getGTFFilename());
    
    if (!fs.existsSync(gtfFile)) {
      throw new Error(`GTF file not found: ${gtfFile}. Run downloadGeneAnnotations() first.`);
    }

    console.log(chalk.blue('📋 Parsing gene annotations from GTF file...'));
    
    const annotations: GeneAnnotation[] = [];
    
    try {
      // Use gunzip to read compressed GTF file (macOS compatible)
      const command = `gunzip -c "${gtfFile}"`;
      const output = execSync(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 100 }); // 100MB buffer
      
      const lines = output.split('\n');
      let lineCount = 0;
      
      for (const line of lines) {
        lineCount++;
        
        if (lineCount % 100000 === 0) {
          console.log(chalk.gray(`  Processed ${lineCount.toLocaleString()} lines...`));
        }
        
        // Skip comments and empty lines
        if (line.startsWith('#') || line.trim() === '') continue;
        
        const annotation = this.parseGTFLine(line);
        if (annotation) {
          annotations.push(annotation);
        }
      }
      
      console.log(chalk.green(`✅ Parsed ${annotations.length.toLocaleString()} gene annotations`));
      return annotations;
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to parse GTF file:'), error);
      throw error;
    }
  }

  /**
   * Parse a single GTF line into GeneAnnotation
   */
  private parseGTFLine(line: string): GeneAnnotation | null {
    const fields = line.split('\t');
    
    if (fields.length < 9) return null;
    
    const [chrom, source, featureType, start, end, , strand, , attributes] = fields;
    
    // Parse attributes string
    const attrMap = this.parseAttributes(attributes);
    
    // Only include relevant feature types
    const allowedFeatures = ['gene', 'transcript', 'exon', 'CDS', 'five_prime_UTR', 'three_prime_UTR'];
    if (!allowedFeatures.includes(featureType)) return null;
    
    // Clean chromosome name (remove 'chr' prefix if present)
    const cleanChrom = chrom.replace('chr', '');
    
    return {
      gene_id: attrMap.gene_id || '',
      gene_name: attrMap.gene_name || attrMap.gene_id || '',
      gene_type: attrMap.gene_type || attrMap.gene_biotype || 'unknown',
      chrom: cleanChrom,
      start: parseInt(start),
      end: parseInt(end),
      strand: strand as '+' | '-',
      source: source,
      transcript_id: attrMap.transcript_id,
      exon_number: attrMap.exon_number ? parseInt(attrMap.exon_number) : undefined,
      feature_type: this.normalizeFeatureType(featureType)
    };
  }

  /**
   * Parse GTF attributes string into key-value pairs
   */
  private parseAttributes(attributesStr: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    
    // GTF format: key "value"; key2 "value2";
    const regex = /(\w+)\s+"([^"]+)";?/g;
    let match;
    
    while ((match = regex.exec(attributesStr)) !== null) {
      attributes[match[1]] = match[2];
    }
    
    return attributes;
  }

  /**
   * Normalize feature types to standard categories
   */
  private normalizeFeatureType(featureType: string): GeneAnnotation['feature_type'] {
    switch (featureType.toLowerCase()) {
      case 'five_prime_utr':
      case 'three_prime_utr':
        return 'UTR';
      case 'cds':
        return 'CDS';
      case 'exon':
        return 'exon';
      case 'transcript':
        return 'transcript';
      case 'gene':
      default:
        return 'gene';
    }
  }

  /**
   * Extract unique gene regions from annotations
   */
  extractGeneRegions(annotations: GeneAnnotation[]): GeneRegion[] {
    const geneMap = new Map<string, GeneRegion>();
    
    for (const annotation of annotations) {
      if (annotation.feature_type !== 'gene') continue;
      
      const key = `${annotation.gene_name}_${annotation.chrom}`;
      
      if (!geneMap.has(key)) {
        geneMap.set(key, {
          gene_name: annotation.gene_name,
          chrom: annotation.chrom,
          start: annotation.start,
          end: annotation.end,
          gene_type: annotation.gene_type,
          strand: annotation.strand,
          transcript_count: 0,
          clinical_significance: this.getClinicalSignificance(annotation.gene_name)
        });
      }
    }
    
    // Count transcripts for each gene
    for (const annotation of annotations) {
      if (annotation.feature_type === 'transcript') {
        const key = `${annotation.gene_name}_${annotation.chrom}`;
        const gene = geneMap.get(key);
        if (gene) {
          gene.transcript_count++;
        }
      }
    }
    
    return Array.from(geneMap.values()).sort((a, b) => {
      // Sort by chromosome, then by position
      const chromA = this.chromosomeToNumber(a.chrom);
      const chromB = this.chromosomeToNumber(b.chrom);
      
      if (chromA !== chromB) return chromA - chromB;
      return a.start - b.start;
    });
  }

  /**
   * Get clinical significance for known genes
   */
  private getClinicalSignificance(geneName: string): string | undefined {
    const clinicalGenes: Record<string, string> = {
      // Cancer genes
      'BRCA1': 'Hereditary breast and ovarian cancer syndrome',
      'BRCA2': 'Hereditary breast and ovarian cancer syndrome',
      'MLH1': 'Lynch syndrome (hereditary nonpolyposis colorectal cancer)',
      'MSH2': 'Lynch syndrome (hereditary nonpolyposis colorectal cancer)',
      'MSH6': 'Lynch syndrome (hereditary nonpolyposis colorectal cancer)',
      'PMS2': 'Lynch syndrome (hereditary nonpolyposis colorectal cancer)',
      'APC': 'Familial adenomatous polyposis',
      'TP53': 'Li-Fraumeni syndrome',
      'VHL': 'Von Hippel-Lindau syndrome',
      'RET': 'Multiple endocrine neoplasia type 2',
      'PTEN': 'PTEN hamartoma tumor syndrome',
      
      // Cardiac genes
      'MYBPC3': 'Hypertrophic cardiomyopathy',
      'MYH7': 'Hypertrophic and dilated cardiomyopathy',
      'TNNT2': 'Hypertrophic cardiomyopathy',
      'TNNI3': 'Hypertrophic and restrictive cardiomyopathy',
      'TPM1': 'Hypertrophic and dilated cardiomyopathy',
      'MYL2': 'Hypertrophic cardiomyopathy',
      'MYL3': 'Hypertrophic cardiomyopathy',
      'ACTC1': 'Hypertrophic and dilated cardiomyopathy',
      
      // Pharmacogenomic genes
      'CYP2D6': 'Drug metabolism - antidepressants, antipsychotics',
      'CYP2C19': 'Drug metabolism - clopidogrel, proton pump inhibitors',
      'CYP2C9': 'Drug metabolism - warfarin, phenytoin',
      'VKORC1': 'Warfarin sensitivity',
      'SLCO1B1': 'Statin-induced myopathy',
      'DPYD': 'Fluoropyrimidine toxicity',
      'TPMT': 'Thiopurine toxicity',
      'UGT1A1': 'Irinotecan toxicity'
    };
    
    return clinicalGenes[geneName];
  }

  /**
   * Convert chromosome string to number for sorting
   */
  private chromosomeToNumber(chrom: string): number {
    if (chrom === 'X') return 23;
    if (chrom === 'Y') return 24;
    if (chrom === 'MT' || chrom === 'M') return 25;
    return parseInt(chrom) || 999;
  }

  /**
   * Find gene by name
   */
  findGeneByName(geneRegions: GeneRegion[], geneName: string): GeneRegion | null {
    return geneRegions.find(gene => 
      gene.gene_name.toLowerCase() === geneName.toLowerCase()
    ) || null;
  }

  /**
   * Find genes in a chromosomal region
   */
  findGenesInRegion(geneRegions: GeneRegion[], chrom: string, start: number, end: number): GeneRegion[] {
    return geneRegions.filter(gene => 
      gene.chrom === chrom.replace('chr', '') &&
      gene.start <= end &&
      gene.end >= start
    );
  }

  /**
   * Get genes by type (protein_coding, lncRNA, etc.)
   */
  getGenesByType(geneRegions: GeneRegion[], geneType: string): GeneRegion[] {
    return geneRegions.filter(gene => gene.gene_type === geneType);
  }

  /**
   * Get clinical genes only
   */
  getClinicalGenes(geneRegions: GeneRegion[]): GeneRegion[] {
    return geneRegions.filter(gene => gene.clinical_significance !== undefined);
  }

  /**
   * Get download status and information
   */
  getDownloadStatus(): {
    gtfExists: boolean;
    gtfSize?: string;
    gtfPath?: string;
    downloadConfig: GTFDownloadConfig;
  } {
    const gtfFile = path.join(this.downloadConfig.outputDir, this.getGTFFilename());
    const exists = fs.existsSync(gtfFile);
    
    let size: string | undefined;
    if (exists) {
      const stats = fs.statSync(gtfFile);
      size = `${(stats.size / 1024 / 1024).toFixed(1)} MB`;
    }
    
    return {
      gtfExists: exists,
      gtfSize: size,
      gtfPath: exists ? gtfFile : undefined,
      downloadConfig: this.downloadConfig
    };
  }

  /**
   * Clean up downloaded files
   */
  cleanup(): void {
    const gtfFile = path.join(this.downloadConfig.outputDir, this.getGTFFilename());
    
    if (fs.existsSync(gtfFile)) {
      fs.unlinkSync(gtfFile);
      console.log(chalk.gray('🗑️  Removed downloaded GTF file'));
    }
  }
}