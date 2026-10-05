const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs/promises');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MIME_TYPES = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    text: 'text/plain'
};

const apiKey = process.env.GEMINI_API_KEY?.trim();
const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';
const hasValidApiKey = Boolean(apiKey && /^[\x21-\x7e]+$/.test(apiKey));
const genAI = hasValidApiKey ? new GoogleGenerativeAI(apiKey) : null;
let pdfExtractionQueue = Promise.resolve();

function extractPdfText(buffer) {
    const extraction = pdfExtractionQueue.then(() => pdfParse(buffer));
    pdfExtractionQueue = extraction.catch(() => {});
    return extraction;
}

async function extractDocumentText(filePath, mimeType) {
    let buffer;
    let text;
    try {
        buffer = await fs.readFile(filePath);
        if (mimeType === MIME_TYPES.pdf) {
            if (buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
                throw Object.assign(new Error('File content does not match the declared document type.'), { statusCode: 400 });
            }
            text = (await extractPdfText(buffer)).text;
        } else if (mimeType === MIME_TYPES.docx) {
            if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
                throw Object.assign(new Error('File content does not match the declared document type.'), { statusCode: 400 });
            }
            text = (await mammoth.extractRawText({ buffer })).value;
        } else if (mimeType === MIME_TYPES.text) {
            if (buffer.includes(0)) {
                throw Object.assign(new Error('File content does not match the declared document type.'), { statusCode: 400 });
            }
            text = buffer.toString('utf8');
        } else {
            throw Object.assign(new Error('Unsupported document type. Upload a PDF, DOCX, or TXT file.'), { statusCode: 400 });
        }
    } catch (err) {
        if (err.statusCode) throw err;
        const documentType = mimeType === MIME_TYPES.pdf ? 'PDF' : mimeType === MIME_TYPES.docx ? 'DOCX' : 'TXT';
        const nextStep = mimeType === MIME_TYPES.text
            ? 'Re-upload the TXT file or paste its text.'
            : `Upload a readable, unencrypted ${documentType} or paste its text.`;
        throw Object.assign(
            new Error(`Could not extract text from this ${documentType}. ${nextStep}`, { cause: err }),
            { statusCode: 422 }
        );
    }
    if (typeof text !== 'string' || !text.trim()) {
        const documentType = mimeType === MIME_TYPES.pdf ? 'PDF' : mimeType === MIME_TYPES.docx ? 'DOCX' : 'TXT';
        throw Object.assign(
            new Error(`No readable text was found in this ${documentType}. Upload a text-based document or paste its text.`),
            { statusCode: 422 }
        );
    }
    return text.trim();
}

async function requestJson(prompt) {
    if (!genAI) {
        throw Object.assign(
            new Error(apiKey
                ? 'GEMINI_API_KEY contains invalid characters. Re-enter a valid key in the backend environment.'
                : 'AI service is not configured. Set GEMINI_API_KEY in the backend environment.'),
            { statusCode: 503 }
        );
    }
    let responseText;
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const result = await model.generateContent(Array.isArray(prompt)
                ? { contents: [{ role: 'user', parts: prompt }] }
                : prompt);
            responseText = result.response.text();
            break;
        } catch (err) {
            const retryable = /(?:429|500|502|503|504|high demand|temporarily unavailable)/i.test(err.message);
            if (retryable && attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
                continue;
            }
            console.error('Gemini request failed:', err.message);
            throw Object.assign(
                new Error('AI provider request failed. Check the configured API key, model availability, quota, and network access.'),
                { statusCode: 502 }
            );
        }
    }
    if (typeof responseText !== 'string' || !responseText.trim()) {
        throw Object.assign(new Error('AI returned an empty response.'), { statusCode: 502 });
    }
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw Object.assign(new Error('AI returned an invalid response.'), { statusCode: 502 });
    }
    try {
        return JSON.parse(jsonMatch[0]);
    } catch (err) {
        throw Object.assign(new Error('AI returned invalid JSON.'), { statusCode: 502 });
    }
}

async function reviewReport(reportText, title, internName, reportType, schoolTemplate = '') {
    if (reportType === 'final') {
        return reviewFinalReport(reportText, title, internName, 'ims-final-v1', schoolTemplate);
    }
    const finalInstructions = reportType === 'final'
        ? `Compare the final report against the uploaded school template. List every required template heading/section that is absent or substantively incomplete in "missing_sections".`
        : `Review this ${reportType} report for specificity, completeness and progress evidence.`;
    const prompt = `You are an internship report reviewer. Assess a ${reportType} report titled "${title}" submitted by "${internName}".
${finalInstructions}
${reportType === 'final' ? `Uploaded school template:\n${schoolTemplate}` : ''}
Report content:\n${reportText}
Do not invent facts. Return raw JSON: {"score":0,"summary":"...","technical_depth":"...","key_achievements":["..."],"feedback":"constructive feedback","missing_sections":["..."]}. Score must be an integer 0-100. For daily/weekly reports missing_sections must be [].`;
    const review = await requestJson(prompt);
    if (!Number.isFinite(Number(review.score))) throw Object.assign(new Error('AI returned an invalid report score.'), { statusCode: 502 });
    review.score = Math.max(0, Math.min(100, Math.round(Number(review.score))));
    if (reportType === 'final' && !Array.isArray(review.missing_sections)) throw Object.assign(new Error('AI returned invalid missing-section results.'), { statusCode: 502 });
    review.missing_sections = Array.isArray(review.missing_sections) ? review.missing_sections : [];
    return review;
}

async function reviewFinalReport(reportText, title, internName = 'Intern', templateId = 'ims-final-v1', schoolTemplate = '') {
    if (!reportText.trim() || !schoolTemplate.trim()) {
        throw Object.assign(new Error('Final report text and school template text are required for template-based scoring.'), { statusCode: 422 });
    }

    const outline = await requestJson(`Extract the required sections and their expected content from this school internship report template.
Return JSON only: {"sections":[{"heading":"...","requirements":"..."}]}. Include each distinct required section once, preserve the template wording, and do not include optional examples, page numbers, or blank form fields.
Template:
${schoolTemplate}`);
    if (!Array.isArray(outline.sections) || !outline.sections.length) {
        throw Object.assign(new Error('The AI could not identify required sections in the school template.'), { statusCode: 502 });
    }
    const requiredSections = outline.sections
        .filter((section) => section && typeof section.heading === 'string' && section.heading.trim())
        .slice(0, 100)
        .map((section) => ({
            heading: section.heading.trim().slice(0, 200),
            requirements: typeof section.requirements === 'string' ? section.requirements.trim().slice(0, 600) : ''
        }));
    if (!requiredSections.length) {
        throw Object.assign(new Error('The AI returned no valid required school-template sections.'), { statusCode: 502 });
    }

    const chunkSize = 140000;
    const overlap = 5000;
    const reportChunks = [];
    for (let start = 0; start < reportText.length; start += chunkSize - overlap) {
        reportChunks.push(reportText.slice(start, start + chunkSize));
    }
    const sectionResults = new Map(requiredSections.map((section) => [
        section.heading,
        { heading: section.heading, requirements: section.requirements, score: 0, evidence: '', finding: '' }
    ]));
    for (let index = 0; index < reportChunks.length; index += 2) {
        const batch = reportChunks.slice(index, index + 2);
        const results = await Promise.all(batch.map((chunk, offset) => requestJson(`Review this excerpt from final internship report "${title}" by "${internName}" against the complete required-section checklist.
This is report excerpt ${index + offset + 1} of ${reportChunks.length}; content may continue in another excerpt.
For each checklist heading, return an item only when this excerpt contains relevant evidence. Score completeness from 0 (no adequate evidence) to 100 (requirements fully met). Evidence must be a short exact quote or precise location. Explain concrete gaps for partial sections.
Return JSON: {"matched_sections":[{"heading":"exact checklist heading","score":0,"evidence":"...","finding":"..."}]}.
Checklist:
${JSON.stringify(requiredSections)}
Report excerpt:
${chunk}`)));
        for (const result of results) {
            if (!Array.isArray(result.matched_sections)) {
                throw Object.assign(new Error('AI returned invalid section-by-section report results.'), { statusCode: 502 });
            }
            for (const match of result.matched_sections) {
                if (!match || typeof match.heading !== 'string') continue;
                const section = sectionResults.get(match.heading.trim());
                if (!section) continue;
                const score = Number(match.score);
                if (!Number.isFinite(score)) continue;
                const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
                if (normalizedScore >= section.score) {
                    section.score = normalizedScore;
                    section.evidence = typeof match.evidence === 'string' ? match.evidence.trim().slice(0, 500) : '';
                    section.finding = typeof match.finding === 'string' ? match.finding.trim().slice(0, 500) : '';
                }
            }
        }
    }

    const sections = Array.from(sectionResults.values());
    const score = Math.round(sections.reduce((total, section) => total + section.score, 0) / sections.length);
    const missingSections = sections
        .filter((section) => section.score < 70)
        .map((section) => `${section.heading}: ${section.finding || (section.score === 0 ? 'not found in the report' : 'incomplete against the school template')}`);
    const synthesis = await requestJson(`Summarize this template-based final internship report review.
Return JSON: {"summary":"...","technical_depth":"...","key_achievements":["..."],"feedback":"constructive feedback"}.
Do not change the overall score or invent evidence. Mention the most important missing or incomplete template requirements in feedback.
Title: ${title}
Intern: ${internName}
Calculated template-completion score: ${score}/100
Section results: ${JSON.stringify(sections)}
Missing or incomplete sections: ${JSON.stringify(missingSections)}`);
    return {
        score,
        summary: typeof synthesis.summary === 'string' ? synthesis.summary : `Template-based review completed across ${sections.length} required sections.`,
        technical_depth: typeof synthesis.technical_depth === 'string' ? synthesis.technical_depth : '',
        key_achievements: Array.isArray(synthesis.key_achievements) ? synthesis.key_achievements : [],
        feedback: typeof synthesis.feedback === 'string' ? synthesis.feedback : `Review the missing or incomplete school-template sections: ${missingSections.join('; ')}`,
        missing_sections: missingSections,
        section_results: sections
    };
}

async function evaluateIntern(supervisorNotes, docText = '', internName = 'Intern', tasks = []) {
    const prompt = `Evaluate intern "${internName}" based on supervisor observations, course/task notes and task history.
Supervisor notes: ${supervisorNotes}
Course/task notes: ${docText}
Tasks: ${JSON.stringify(tasks)}
Return raw JSON: {"performance_score":0,"summary":"...","strengths":"...","improvement_areas":"..."}. Score must be an integer 0-100.`;
    const evaluation = await requestJson(prompt);
    if (!Number.isFinite(Number(evaluation.performance_score))) throw Object.assign(new Error('AI returned an invalid evaluation score.'), { statusCode: 502 });
    evaluation.performance_score = Math.max(0, Math.min(100, Math.round(Number(evaluation.performance_score))));
    return evaluation;
}

async function generateEvaluationExercise(supervisorNotes, courseNotes, internName, tasks) {
    const prompt = `Create an assessment for intern "${internName}" using only the supplied course/task notes.
Supervisor notes: ${supervisorNotes}
Course/task notes: ${courseNotes}
Assigned tasks: ${JSON.stringify(tasks)}
Return JSON: {"title":"...","questions":[{"question":"...","expected_points":["..."]}],
"tasks":[{"title":"...","description":"..."}]}. Provide 3-5 questions and 1-3 practical tasks.`;
    const exercise = await requestJson(prompt);
    if (!Array.isArray(exercise.questions) || !exercise.questions.length ||
        !Array.isArray(exercise.tasks) || !exercise.tasks.length) {
        throw Object.assign(new Error('AI returned an invalid assessment.'), { statusCode: 502 });
    }
    exercise.questions = exercise.questions.slice(0, 5);
    exercise.tasks = exercise.tasks.slice(0, 3);
    return exercise;
}

async function scoreEvaluationExercise(questions, tasks, answers, attachments = []) {
    const prompt = `Score an intern assessment fairly using the questions, tasks and expected points.
Questions: ${JSON.stringify(questions)}
Tasks: ${JSON.stringify(tasks)}
Intern answers, reference links, and extracted document evidence: ${JSON.stringify(answers)}
Use attached images as visual evidence of the intern's work. Do not claim to have opened or read the contents of external links.
Return JSON {"score":0,"feedback":"...","question_feedback":[{"index":0,"score":0,"feedback":"..."}]}.
Score must be an integer 0-100.`;
    const imageParts = attachments.filter((attachment) => attachment.data && attachment.mime_type.startsWith('image/'))
        .map((attachment) => ({ inlineData: { mimeType: attachment.mime_type, data: attachment.data } }));
    const attachmentNames = attachments.filter((attachment) => attachment.name)
        .map((attachment) => `Attached evidence: ${attachment.name}`);
    const promptParts = [{ text: [prompt, ...attachmentNames].join('\n') }, ...imageParts];
    const result = await requestJson(promptParts);
    if (!Number.isFinite(Number(result.score))) throw Object.assign(new Error('AI returned an invalid assessment score.'), { statusCode: 502 });
    result.score = Math.max(0, Math.min(100, Math.round(Number(result.score))));
    return result;
}

module.exports = {
    extractDocumentText,
    reviewReport,
    reviewFinalReport,
    evaluateIntern,
    generateEvaluationExercise,
    scoreEvaluationExercise
};
