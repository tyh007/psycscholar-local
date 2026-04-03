import { type ExtractedData } from '@/lib/database'

export interface ExtractionPrompt {
  systemPrompt: string
  userPrompt: string
  expectedFields: string[]
}

export interface CustomFieldDefinition {
  id: string
  name: string
  description: string
  prompt: string
}

export class PromptBuilder {
  private static readonly FIELD_GUIDANCE: Record<string, string> = {
    background: 'Research context, problem statement, and why the study matters. Format as bullet points: • Key point 1, • Key point 2, etc.',
    theory: 'Theoretical framework, key hypotheses, or conceptual propositions tested. Use bullet point format.',
    methodology: 'Research design, sample, procedures, and analyses. Present as bullet points covering each aspect.',
    measures: 'Scales, instruments, tasks, or operationalisations used. List each measure as a bullet point.',
    results: 'Main findings, statistical patterns, and substantive conclusions. Format as distinct bullet points.',
    implications: 'Theoretical or practical implications and contributions. Present as bullet points.',
    limitations: 'Limitations, caveats, or future research directions. Use bullet point format for clarity.'
  }

  private static readonly BASE_SYSTEM_PROMPT = `You are a highly skilled academic researcher and psychologist with expertise in quantitative and qualitative research methods. Your task is to carefully analyze psychology research papers and extract structured information with precision and accuracy.

Guidelines:
1. Be thorough but concise - focus on the most important information
2. Use academic language and maintain objectivity
3. If information is not explicitly stated in the text, respond with "Not mentioned"
4. Extract specific details rather than general statements
5. Pay attention to sample sizes, statistical values, and methodological details
6. Preserve the original meaning and context of the research`

  private static readonly BRIEF_MODE_INSTRUCTIONS = `Provide concise, bullet-point style responses focusing on the most essential information. 
For each field, format your response as:
- Use bullet points (•) for key items
- Keep each bullet point to 1 sentence maximum
- Aim for 2-4 bullet points per field
- Be specific and avoid repetition
- If no information available, respond with exactly: "Not mentioned"`

  private static readonly DETAILED_MODE_INSTRUCTIONS = `Provide comprehensive, detailed responses including specific statistics, methodological details, and nuanced findings. Include relevant quotes or specific details from the text when available.`

  static buildExtractionPrompt(
    paperText: string,
    detailLevel: 'brief' | 'detailed' = 'brief',
    customFields?: CustomFieldDefinition[]
  ): ExtractionPrompt {
    const modeInstructions = detailLevel === 'brief' 
      ? this.BRIEF_MODE_INSTRUCTIONS 
      : this.DETAILED_MODE_INSTRUCTIONS

    const systemPrompt = `${this.BASE_SYSTEM_PROMPT}

${modeInstructions}

Please extract the following information from the psychology research paper and respond with a valid JSON object containing these exact fields:`

    const fields = [
      'background',
      'theory', 
      'methodology',
      'measures',
      'results',
      'implications',
      'limitations'
    ]

    let fieldDescriptions = `
Fields to fill:
- background: ${this.FIELD_GUIDANCE.background}
- theory: ${this.FIELD_GUIDANCE.theory}
- methodology: ${this.FIELD_GUIDANCE.methodology}
- measures: ${this.FIELD_GUIDANCE.measures}
- results: ${this.FIELD_GUIDANCE.results}
- implications: ${this.FIELD_GUIDANCE.implications}
- limitations: ${this.FIELD_GUIDANCE.limitations}`

    // Add custom fields if provided
    if (customFields && customFields.length > 0) {
      customFields.forEach(field => {
        fields.push(field.id)
        fieldDescriptions += `
- ${field.id}: ${field.description}`
      })
    }

    const outputTemplate = JSON.stringify(
      Object.fromEntries(fields.map(field => [field, ''])),
      null,
      2
    )

    const userPrompt = `Please analyze the following psychology research paper text and extract the requested information:

${paperText}

${fieldDescriptions}

Return valid JSON only using exactly these keys:
${outputTemplate}

Output format instructions:
- For brief mode: Each field value should be well-formatted bullets separated by newlines, starting with "• "
- Example: "• First key finding\n• Second key finding\n• Third key finding"
- Do NOT include markdown code blocks or extra formatting
- Replace every empty string with real paper-specific content
- Do not copy the field descriptions above
- If a field is truly unavailable, use exactly: "Not mentioned"
- Do not include any explanations or extra keys
- Ensure NO text is truncated or incomplete`

    return {
      systemPrompt,
      userPrompt,
      expectedFields: fields
    }
  }

  static buildCustomFieldPrompt(
    paperText: string,
    customField: CustomFieldDefinition,
    detailLevel: 'brief' | 'detailed' = 'brief'
  ): string {
    const modeInstructions = detailLevel === 'brief' 
      ? 'Provide a concise response focusing on the most relevant information (1-2 sentences maximum).' 
      : 'Provide a detailed, comprehensive response with specific examples and details from the text.'

    return `${this.BASE_SYSTEM_PROMPT}

${modeInstructions}

Custom Field: ${customField.name}
Description: ${customField.description}

${customField.prompt}

Please analyze the following psychology research paper text and extract information related to the custom field above:

${paperText}

Respond with the extracted information only. Do not include explanations or formatting.`
  }

  static buildReExtractionPrompt(
    paperText: string,
    existingExtraction: ExtractedData,
    fieldsToUpdate: string[],
    detailLevel: 'brief' | 'detailed' = 'brief'
  ): ExtractionPrompt {
    const modeInstructions = detailLevel === 'brief' 
      ? this.BRIEF_MODE_INSTRUCTIONS 
      : this.DETAILED_MODE_INSTRUCTIONS

    const systemPrompt = `${this.BASE_SYSTEM_PROMPT}

${modeInstructions}

You are updating an existing extraction for a psychology research paper. Please focus only on the specified fields and provide improved, more accurate information.

Fields to update: ${fieldsToUpdate.join(', ')}

Current extraction data:
${JSON.stringify(existingExtraction, null, 2)}

Please respond with a complete JSON object containing all original fields with updates for the specified fields only.`

    const userPrompt = `Please re-analyze the following psychology research paper text and provide improved extractions for the specified fields:

${paperText}

Focus on providing more accurate, detailed information for: ${fieldsToUpdate.join(', ')}

Respond with valid JSON only. Include all fields from the original extraction with improvements for the specified fields.`

    return {
      systemPrompt,
      userPrompt,
      expectedFields: Object.keys(existingExtraction)
    }
  }

  static buildCrossPaperAnalysisPrompt(
    papers: Array<{
      title: string
      authors: string
      year: number
      extractedData: ExtractedData
    }>,
    analysisQuestion: string
  ): string {
    const papersText = papers.map((paper, index) => `
Paper ${index + 1}:
Title: ${paper.title}
Authors: ${paper.authors}
Year: ${paper.year}
Background: ${paper.extractedData.background}
Theory: ${paper.extractedData.theory}
Methodology: ${paper.extractedData.methodology}
Measures: ${paper.extractedData.measures}
Results: ${paper.extractedData.results}
Implications: ${paper.extractedData.implications}
Limitations: ${paper.extractedData.limitations}
`).join('\n---\n')

    return `${this.BASE_SYSTEM_PROMPT}

You are conducting a cross-paper analysis of multiple psychology research studies. Please analyze the following papers and answer the specific research question.

Research Question: ${analysisQuestion}

${papersText}

Please provide a comprehensive analysis that:
1. Synthesizes findings across all papers
2. Identifies patterns, contradictions, or gaps
3. Highlights methodological differences that might explain variations
4. Suggests implications for theory or practice

Provide your analysis in a structured, academic format with clear sections.`
  }

  static buildMethodologyComparisonPrompt(
    papers: Array<{
      title: string
      methodology: string
      measures: string
      results: string
    }>
  ): string {
    const methodologiesText = papers.map((paper, index) => `
Study ${index + 1}: ${paper.title}
Methodology: ${paper.methodology}
Measures: ${paper.measures}
Results: ${paper.results}
`).join('\n---\n')

    return `${this.BASE_SYSTEM_PROMPT}

Please conduct a detailed methodological comparison of the following psychology studies:

${methodologiesText}

Focus on:
1. Research designs and their strengths/limitations
2. Sample characteristics and sizes
3. Measurement approaches and psychometric properties
4. Statistical analyses used
5. How methodological differences might explain variations in findings

Provide a structured comparison table and narrative analysis.`
  }

  static validatePromptResponse(response: string, expectedFields: string[]): boolean {
    try {
      const parsed = JSON.parse(response)
      return expectedFields.every(field => field in parsed)
    } catch {
      return false
    }
  }

  static sanitizeResponse(response: string): string {
    let cleaned = response.trim()
    
    // Remove markdown code blocks
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    }
    
    // Extract JSON if there's surrounding text
    const jsonStart = cleaned.indexOf('{')
    const jsonEnd = cleaned.lastIndexOf('}')
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1)
    }
    
    return cleaned
  }
}

// Predefined custom fields for psychology research
export const PSYCHOLOGY_CUSTOM_FIELDS: CustomFieldDefinition[] = [
  {
    id: 'sample_demographics',
    name: 'Sample Demographics',
    description: 'Detailed demographic information about study participants',
    prompt: 'Extract detailed demographic information including age ranges, gender distribution, ethnicity, education level, and any other relevant participant characteristics.'
  },
  {
    id: 'effect_sizes',
    name: 'Effect Sizes',
    description: 'Statistical effect sizes and their interpretation',
    prompt: 'Extract all reported effect sizes (Cohen\'s d, r, η², etc.) with their values and interpretation according to conventional standards.'
  },
  {
    id: 'statistical_tests',
    name: 'Statistical Tests',
    description: 'Specific statistical tests and their results',
    prompt: 'List all statistical tests performed (t-tests, ANOVA, regression, etc.) with test statistics, degrees of freedom, p-values, and confidence intervals.'
  },
  {
    id: 'theoretical_contributions',
    name: 'Theoretical Contributions',
    description: 'How the study contributes to theory development',
    prompt: 'Extract specific theoretical contributions and how this study advances, refutes, or extends existing theories in the field.'
  },
  {
    id: 'practical_applications',
    name: 'Practical Applications',
    description: 'Real-world applications and implications',
    prompt: 'Extract practical applications, clinical implications, or real-world relevance of the research findings.'
  }
]
