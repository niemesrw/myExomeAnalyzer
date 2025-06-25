-- Example SQL queries for VCF analysis
-- These can be run directly against the PostgreSQL database

-- 1. Basic variant statistics
SELECT 
    COUNT(*) as total_variants,
    COUNT(DISTINCT chrom) as chromosomes,
    COUNT(DISTINCT CASE WHEN filter = 'PASS' THEN id END) as passing_variants,
    AVG(qual) as avg_quality,
    MIN(pos) as min_position,
    MAX(pos) as max_position
FROM vcf.variants;

-- 2. Variant distribution by chromosome
SELECT 
    chrom,
    COUNT(*) as variant_count,
    AVG(qual) as avg_quality,
    COUNT(CASE WHEN filter = 'PASS' THEN 1 END) as passing_variants
FROM vcf.variants
GROUP BY chrom
ORDER BY 
    CASE 
        WHEN chrom ~ '^[0-9]+$' THEN chrom::integer
        ELSE 999
    END,
    chrom;

-- 3. Quality score distribution
SELECT 
    CASE 
        WHEN qual IS NULL THEN 'NULL'
        WHEN qual < 10 THEN '0-10'
        WHEN qual < 20 THEN '10-20'
        WHEN qual < 30 THEN '20-30'
        WHEN qual < 50 THEN '30-50'
        WHEN qual < 100 THEN '50-100'
        ELSE '100+'
    END as quality_range,
    COUNT(*) as variant_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM vcf.variants
GROUP BY 
    CASE 
        WHEN qual IS NULL THEN 'NULL'
        WHEN qual < 10 THEN '0-10'
        WHEN qual < 20 THEN '10-20'
        WHEN qual < 30 THEN '20-30'
        WHEN qual < 50 THEN '30-50'
        WHEN qual < 100 THEN '50-100'
        ELSE '100+'
    END
ORDER BY 
    CASE 
        WHEN qual IS NULL THEN 0
        WHEN qual < 10 THEN 1
        WHEN qual < 20 THEN 2
        WHEN qual < 30 THEN 3
        WHEN qual < 50 THEN 4
        WHEN qual < 100 THEN 5
        ELSE 6
    END;

-- 4. Find high-impact variants (assuming annotations exist)
SELECT 
    v.chrom,
    v.pos,
    v.ref,
    v.alt,
    v.qual,
    va.consequence,
    va.impact,
    g.symbol as gene
FROM vcf.variants v
JOIN vcf.variant_annotations va ON v.id = va.variant_id
JOIN vcf.genes g ON va.gene_id = g.id
WHERE va.impact IN ('HIGH', 'MODERATE')
  AND v.qual > 30
ORDER BY v.qual DESC
LIMIT 100;

-- 5. Sample genotype quality metrics
SELECT 
    s.name as sample_name,
    COUNT(*) as total_genotypes,
    COUNT(CASE WHEN g.gt IS NOT NULL AND g.gt != './.' THEN 1 END) as called_genotypes,
    AVG(g.gq) as avg_genotype_quality,
    AVG(g.dp) as avg_depth,
    COUNT(CASE WHEN g.gt LIKE '%1%' THEN 1 END) as alt_allele_count
FROM vcf.samples s
JOIN vcf.genotypes g ON s.id = g.sample_id
GROUP BY s.id, s.name
ORDER BY s.name;

-- 6. Variant allele frequency calculation
SELECT 
    v.chrom,
    v.pos,
    v.ref,
    v.alt,
    vcf.calculate_allele_frequency(v.id) as allele_frequency
FROM vcf.variants v
WHERE v.qual > 50
ORDER BY v.chrom, v.pos
LIMIT 20;

-- 7. Rare variants (assuming population frequency in INFO)
SELECT 
    v.chrom,
    v.pos,
    v.ref,
    v.alt,
    v.qual,
    v.info->>'AF' as allele_frequency
FROM vcf.variants v
WHERE (v.info->>'AF')::float < 0.01  -- Less than 1% frequency
  AND v.qual > 30
  AND v.filter = 'PASS'
ORDER BY (v.info->>'AF')::float ASC
LIMIT 50;

-- 8. Variants in specific genomic region (example: BRCA1 region)
SELECT 
    v.chrom,
    v.pos,
    v.ref,
    v.alt,
    v.qual,
    v.filter,
    COUNT(DISTINCT g.sample_id) as samples_with_variant
FROM vcf.variants v
LEFT JOIN vcf.genotypes g ON v.id = g.variant_id AND g.gt LIKE '%1%'
WHERE v.chrom = '17'
  AND v.pos BETWEEN 43044294 AND 43125482  -- BRCA1 coordinates (approximate)
GROUP BY v.id, v.chrom, v.pos, v.ref, v.alt, v.qual, v.filter
ORDER BY v.pos;

-- 9. Transition/Transversion ratio
SELECT 
    CASE 
        WHEN (ref = 'A' AND alt = 'G') OR (ref = 'G' AND alt = 'A') OR
             (ref = 'C' AND alt = 'T') OR (ref = 'T' AND alt = 'C') THEN 'Transition'
        WHEN ref IN ('A', 'T', 'C', 'G') AND alt IN ('A', 'T', 'C', 'G') AND
             LENGTH(ref) = 1 AND LENGTH(alt) = 1 THEN 'Transversion'
        ELSE 'Other'
    END as mutation_type,
    COUNT(*) as count
FROM vcf.variants
WHERE LENGTH(ref) = 1 AND LENGTH(alt) = 1  -- SNVs only
GROUP BY 
    CASE 
        WHEN (ref = 'A' AND alt = 'G') OR (ref = 'G' AND alt = 'A') OR
             (ref = 'C' AND alt = 'T') OR (ref = 'T' AND alt = 'C') THEN 'Transition'
        WHEN ref IN ('A', 'T', 'C', 'G') AND alt IN ('A', 'T', 'C', 'G') AND
             LENGTH(ref) = 1 AND LENGTH(alt) = 1 THEN 'Transversion'
        ELSE 'Other'
    END;

-- 10. Variants shared between samples
SELECT 
    v.chrom,
    v.pos,
    v.ref,
    v.alt,
    COUNT(DISTINCT g.sample_id) as shared_samples,
    ARRAY_AGG(DISTINCT s.name) as sample_names
FROM vcf.variants v
JOIN vcf.genotypes g ON v.id = g.variant_id
JOIN vcf.samples s ON g.sample_id = s.id
WHERE g.gt LIKE '%1%'  -- Has alternate allele
GROUP BY v.id, v.chrom, v.pos, v.ref, v.alt
HAVING COUNT(DISTINCT g.sample_id) > 1  -- Shared by multiple samples
ORDER BY COUNT(DISTINCT g.sample_id) DESC, v.chrom, v.pos
LIMIT 100;

-- 11. Performance monitoring query
EXPLAIN (ANALYZE, BUFFERS) 
SELECT v.*, COUNT(g.sample_id) as sample_count
FROM vcf.variants v
LEFT JOIN vcf.genotypes g ON v.id = g.variant_id
WHERE v.chrom = '1' AND v.pos BETWEEN 1000000 AND 2000000
GROUP BY v.id
ORDER BY v.pos;