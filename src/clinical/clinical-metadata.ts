/**
 * Clinical Genomics Metadata and Safety Framework
 * Provides clinical context, disclaimers, and safety guidelines for genomic data interpretation
 */

export interface ClinicalVariantMetadata {
    analysisType: string;
    clinicalSignificance: string;
    populationContext: string;
    validationRequired: string;
    qualityInterpretation: Record<string, string>;
    disclaimer: string;
    recommendations: string[];
}

export interface ClinicalGeneCategory {
    name: string;
    genes: string[];
    description: string;
    clinicalContext: string;
    actionability: 'high' | 'medium' | 'low';
    testingRecommendations: string[];
}

export interface ClinicalResponseWrapper<T> {
    data: T;
    clinicalMetadata: ClinicalVariantMetadata;
    geneContext?: ClinicalGeneCategory;
    populationWarnings: string[];
    clinicalRecommendations: string[];
    safetyLevel: 'research' | 'educational' | 'clinical';
}

export class ClinicalMetadataService {
    private readonly clinicalGenes: Record<string, ClinicalGeneCategory> = {
        tier1_cancer: {
            name: 'Tier 1 Cancer Genes',
            genes: ['BRCA1', 'BRCA2', 'MLH1', 'MSH2', 'MSH6', 'PMS2', 'APC', 'TP53', 'VHL', 'RET', 'PTEN'],
            description: 'Established cancer predisposition genes with high clinical actionability',
            clinicalContext: `
                These genes have strong evidence for cancer predisposition when pathogenic variants are present.
                Clinical management guidelines exist for carriers of pathogenic variants.
                Enhanced screening and risk-reducing interventions may be recommended.
                Family history assessment is crucial for risk evaluation.
            `,
            actionability: 'high',
            testingRecommendations: [
                'Clinical genetic testing recommended for suspicious variants',
                'Genetic counseling strongly recommended',
                'Family cascade testing may be indicated',
                'Clinical management guidelines available for pathogenic variants'
            ]
        },
        
        tier1_cardiac: {
            name: 'Tier 1 Cardiac Genes',
            genes: ['MYBPC3', 'MYH7', 'TNNT2', 'TNNI3', 'MYL2', 'MYL3', 'ACTC1', 'TPM1'],
            description: 'Established cardiomyopathy genes with clinical actionability',
            clinicalContext: `
                These genes are associated with hypertrophic and dilated cardiomyopathy.
                Clinical correlation with family history and symptoms is essential.
                Cardiac screening and family evaluation may be recommended for pathogenic variants.
                Variable penetrance and expressivity are common.
            `,
            actionability: 'high',
            testingRecommendations: [
                'Clinical genetic testing with cardiac evaluation',
                'Family history assessment required',
                'Cardiac screening for at-risk family members',
                'Sports participation evaluation may be needed'
            ]
        },

        pharmacogenomics: {
            name: 'Pharmacogenomic Genes',
            genes: ['CYP2D6', 'CYP2C19', 'CYP2C9', 'VKORC1', 'SLCO1B1', 'DPYD', 'TPMT', 'UGT1A1'],
            description: 'Genes affecting drug metabolism and response',
            clinicalContext: `
                These genes affect medication efficacy and safety.
                Clinical implementation varies by healthcare system and medication.
                Consult pharmacist or physician for medication adjustments.
                Preemptive testing may be beneficial for certain medications.
            `,
            actionability: 'medium',
            testingRecommendations: [
                'Consult pharmacist or physician for medication considerations',
                'Clinical pharmacogenomic testing available',
                'Medication adjustments may be warranted',
                'Consider preemptive testing if family history of drug reactions'
            ]
        }
    };

    private readonly baseClinicalMetadata: ClinicalVariantMetadata = {
        analysisType: 'Research-grade genomic analysis',
        clinicalSignificance: 'Unknown - requires clinical interpretation and validation',
        populationContext: 'Most genomic variants (>95%) are benign population polymorphisms',
        validationRequired: 'Clinical genetic testing required for health-related decisions',
        qualityInterpretation: {
            'PASS': 'High quality variant - suitable for clinical consideration with validation',
            'BOOSTED': 'Quality-boosted variant - high confidence, suitable for clinical consideration',
            'IMP': 'Imputed variant - statistical inference, moderate confidence, requires validation',
            'LOWQ': 'Low quality variant - not suitable for clinical decisions',
            '.': 'No filter applied - quality assessment needed'
        },
        disclaimer: `
⚠️  IMPORTANT CLINICAL DISCLAIMER:
This analysis is for RESEARCH and EDUCATIONAL purposes only.
Clinical genetic testing by certified laboratories is required for health decisions.
Most genomic variants are benign population polymorphisms.
Consult a genetic counselor or medical geneticist for clinical interpretation.
        `.trim(),
        recommendations: [
            'Consult genetic counselor for clinical interpretation',
            'Clinical genetic testing required for health-related decisions',
            'Focus analysis on established clinically actionable genes',
            'Consider population frequency when interpreting significance',
            'Validate findings with family history and clinical correlation'
        ]
    };

    getClinicalMetadata(context?: string): ClinicalVariantMetadata {
        return { ...this.baseClinicalMetadata };
    }

    getGeneCategory(geneName: string): ClinicalGeneCategory | null {
        for (const category of Object.values(this.clinicalGenes)) {
            if (category.genes.includes(geneName.toUpperCase())) {
                return category;
            }
        }
        return null;
    }

    getAllClinicalGenes(): string[] {
        return Object.values(this.clinicalGenes)
            .flatMap(category => category.genes);
    }

    getClinicalGenesByCategory(categoryName: string): string[] {
        const category = this.clinicalGenes[categoryName];
        return category ? category.genes : [];
    }

    generatePopulationWarnings(alleleFrequency?: number): string[] {
        const warnings: string[] = [];
        
        if (alleleFrequency !== undefined) {
            if (alleleFrequency > 0.01) {
                warnings.push(
                    `⚠️ Common variant: Allele frequency ${(alleleFrequency * 100).toFixed(1)}% indicates likely benign polymorphism`
                );
            } else if (alleleFrequency > 0.001) {
                warnings.push(
                    `ℹ️ Low frequency variant: Allele frequency ${(alleleFrequency * 100).toFixed(2)}% - clinical significance uncertain`
                );
            } else {
                warnings.push(
                    `🔍 Rare variant: Allele frequency <0.1% - requires careful clinical evaluation`
                );
            }
        } else {
            warnings.push(
                `❓ Population frequency unknown - consider population database lookup for clinical interpretation`
            );
        }

        return warnings;
    }

    generateClinicalRecommendations(
        genes: string[], 
        qualityFilter: string[], 
        analysisType: string = 'general'
    ): string[] {
        const recommendations: string[] = [...this.baseClinicalMetadata.recommendations];

        // Gene-specific recommendations
        const clinicalGenes = genes.filter(gene => this.getAllClinicalGenes().includes(gene.toUpperCase()));
        if (clinicalGenes.length > 0) {
            recommendations.push(
                `🧬 Clinical genes detected: ${clinicalGenes.join(', ')} - enhanced clinical evaluation recommended`
            );
        }

        // Quality-specific recommendations
        if (qualityFilter.includes('LOWQ')) {
            recommendations.push(
                `⚠️ Low quality variants detected - clinical confirmation required before interpretation`
            );
        }
        
        if (qualityFilter.includes('BOOSTED') || qualityFilter.includes('PASS')) {
            recommendations.push(
                `✅ High quality variants detected - suitable for clinical consideration with validation`
            );
        }
        
        if (qualityFilter.includes('IMP')) {
            recommendations.push(
                `ℹ️ Imputed variants detected - statistical inference with moderate confidence, clinical validation recommended`
            );
        }

        // Analysis type specific recommendations
        if (analysisType === 'cancer') {
            recommendations.push(
                `🎗️ Cancer gene analysis - consider family history and clinical presentation`
            );
        } else if (analysisType === 'cardiac') {
            recommendations.push(
                `❤️ Cardiac gene analysis - clinical cardiac evaluation recommended`
            );
        } else if (analysisType === 'pharmacogenomic') {
            recommendations.push(
                `💊 Pharmacogenomic analysis - consult pharmacist or physician for medication considerations`
            );
        }

        return recommendations;
    }

    wrapWithClinicalContext<T>(
        data: T,
        options: {
            genes?: string[];
            qualityFilters?: string[];
            alleleFrequency?: number;
            analysisType?: string;
            safetyLevel?: 'research' | 'educational' | 'clinical';
        } = {}
    ): ClinicalResponseWrapper<T> {
        const {
            genes = [],
            qualityFilters = [],
            alleleFrequency,
            analysisType = 'general',
            safetyLevel = 'research'
        } = options;

        // Find relevant gene category
        const geneContext = genes.length > 0 
            ? this.getGeneCategory(genes[0]) || undefined
            : undefined;

        return {
            data,
            clinicalMetadata: this.getClinicalMetadata(analysisType),
            geneContext,
            populationWarnings: this.generatePopulationWarnings(alleleFrequency),
            clinicalRecommendations: this.generateClinicalRecommendations(
                genes, 
                qualityFilters, 
                analysisType
            ),
            safetyLevel
        };
    }

    getClinicalInterpretationPrompt(analysisType: string = 'general', genes: string[] = []): string {
        const baseContext = `
🏥 CLINICAL GENOMICS ANALYSIS CONTEXT:

CRITICAL SAFETY GUIDELINES:
1. This analysis is for RESEARCH and EDUCATIONAL purposes only
2. Clinical genetic testing by certified laboratories required for health decisions
3. Most genomic variants (>95%) are benign population polymorphisms
4. Variant detection ≠ clinical significance or increased disease risk
5. Population frequency >1% indicates likely benign variant

ANALYSIS FRAMEWORK:
- Prioritize established clinically actionable genes
- Apply population frequency filtering (exclude common variants >1%)
- Interpret quality scores appropriately (PASS > BOOSTED > IMP > LOWQ)
- Emphasize clinical validation requirements
- Provide balanced risk communication
        `;

        const specificContext = this.getAnalysisSpecificContext(analysisType, genes);
        
        return `${baseContext}\n\n${specificContext}`;
    }

    private getAnalysisSpecificContext(analysisType: string, genes: string[]): string {
        const clinicalGenes = genes.filter(gene => this.getAllClinicalGenes().includes(gene.toUpperCase()));
        
        let context = '';
        
        if (analysisType === 'cancer' || clinicalGenes.some(gene => this.getClinicalGenesByCategory('tier1_cancer').includes(gene))) {
            context += `
🎗️ CANCER GENE ANALYSIS:
- Focus on established pathogenic mutations in BRCA1/2, Lynch syndrome genes
- Most variants in cancer genes are benign
- Enhanced screening only recommended for clinically validated pathogenic variants
- Family history assessment important for risk evaluation
- Consider ethnic-specific founder mutations
            `;
        }
        
        if (analysisType === 'cardiac' || clinicalGenes.some(gene => this.getClinicalGenesByCategory('tier1_cardiac').includes(gene))) {
            context += `
❤️ CARDIAC GENE ANALYSIS:
- Focus on cardiomyopathy and arrhythmia genes
- Clinical correlation with family history and symptoms essential
- Genetic testing often performed in clinical settings for symptomatic patients
- Variable penetrance and expressivity are common
- Sports participation evaluation may be needed for pathogenic variants
            `;
        }
        
        if (analysisType === 'pharmacogenomic' || clinicalGenes.some(gene => this.getClinicalGenesByCategory('pharmacogenomics').includes(gene))) {
            context += `
💊 PHARMACOGENOMIC ANALYSIS:
- Focus on established drug-gene interactions
- Clinical implementation varies by healthcare system
- Consult pharmacist or physician for medication adjustments
- Consider preemptive testing for high-risk medications
- Medication adherence and monitoring may be affected
            `;
        }
        
        return context;
    }
}

// Singleton instance for use across the application
export const clinicalMetadata = new ClinicalMetadataService();