jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn()
}));

let GoogleGenerativeAI;

describe('AI service configuration', () => {
    const originalApiKey = process.env.GEMINI_API_KEY;
    const originalModel = process.env.GEMINI_MODEL;

    afterAll(() => {
        if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = originalApiKey;
        if (originalModel === undefined) delete process.env.GEMINI_MODEL;
        else process.env.GEMINI_MODEL = originalModel;
    });

    beforeEach(() => {
        jest.resetModules();
        ({ GoogleGenerativeAI } = require('@google/generative-ai'));
        GoogleGenerativeAI.mockReset();
        process.env.GEMINI_API_KEY = 'test-api-key';
        process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    });

    it('uses the current default Gemini Flash model to generate an evaluation', async () => {
        const exercise = {
            title: 'API validation assessment',
            questions: [{ question: 'How should invalid input be handled?', expected_points: ['Return a client error'] }],
            tasks: [{ title: 'Add validation', description: 'Validate required API fields.' }]
        };
        const generateContent = jest.fn().mockResolvedValue({
            response: { text: () => JSON.stringify(exercise) }
        });
        const getGenerativeModel = jest.fn(() => ({ generateContent }));
        GoogleGenerativeAI.mockImplementation(() => ({ getGenerativeModel }));

        const { generateEvaluationExercise } = require('../services/aiService');
        const result = await generateEvaluationExercise('', 'API notes', 'Example Intern', []);

        expect(getGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-2.5-flash' });
        expect(generateContent).toHaveBeenCalledTimes(1);
        expect(result).toEqual(exercise);
    });

    it('returns an actionable setup error when the API key is missing', async () => {
        process.env.GEMINI_API_KEY = '';
        const { generateEvaluationExercise } = require('../services/aiService');

        await expect(generateEvaluationExercise('', 'API notes', 'Example Intern', []))
            .rejects.toMatchObject({
                statusCode: 503,
                message: expect.stringContaining('GEMINI_API_KEY')
            });
    });

    it('rejects API keys containing invalid header characters', async () => {
        process.env.GEMINI_API_KEY = '\u0016';
        const { generateEvaluationExercise } = require('../services/aiService');

        await expect(generateEvaluationExercise('', 'API notes', 'Example Intern', []))
            .rejects.toMatchObject({
                statusCode: 503,
                message: expect.stringContaining('contains invalid characters')
            });
        expect(GoogleGenerativeAI).not.toHaveBeenCalled();
    });

    it('scores every chunk of a long final report against each school-template section', async () => {
        const responses = [
            { sections: [
                { heading: 'Introduction', requirements: 'Describe the placement.' },
                { heading: 'Conclusion', requirements: 'Summarize outcomes.' }
            ] },
            { matched_sections: [{ heading: 'Introduction', score: 80, evidence: 'Placement overview', finding: '' }] },
            { matched_sections: [{ heading: 'Introduction', score: 35, evidence: 'Short mention', finding: 'The overview is brief.' }] },
            { summary: 'The report has a partial introduction.', technical_depth: 'Moderate', key_achievements: ['Placement overview'], feedback: 'Add a conclusion.' }
        ];
        const generateContent = jest.fn().mockImplementation(async () => ({
            response: { text: () => JSON.stringify(responses.shift()) }
        }));
        GoogleGenerativeAI.mockImplementation(() => ({
            getGenerativeModel: () => ({ generateContent })
        }));
        const { reviewFinalReport } = require('../services/aiService');

        const result = await reviewFinalReport(
            `${'Report body text. '.repeat(9000)}\nConclusion is required but not included.`,
            'Final internship report',
            'Example Intern',
            'ims-final-v1',
            'Introduction: Describe the placement.\nConclusion: Summarize outcomes.'
        );

        expect(generateContent).toHaveBeenCalledTimes(4);
        expect(result.score).toBe(40);
        expect(result.missing_sections).toContain('Conclusion: not found in the report');
        expect(result.section_results).toHaveLength(2);
    });

    it('passes uploaded images to the evaluation scorer as multimodal evidence', async () => {
        const generateContent = jest.fn().mockResolvedValue({
            response: { text: () => JSON.stringify({ score: 87, feedback: 'Good implementation.', question_feedback: [] }) }
        });
        GoogleGenerativeAI.mockImplementation(() => ({
            getGenerativeModel: () => ({ generateContent })
        }));
        const { scoreEvaluationExercise } = require('../services/aiService');

        const result = await scoreEvaluationExercise(
            [{ question: 'Show your result.' }],
            [],
            { answers: 'Implemented the chart.', links: ['https://example.test/chart'] },
            [{ name: 'chart.png', mime_type: 'image/png', data: 'aGVsbG8=' }]
        );

        expect(result.score).toBe(87);
        expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
            contents: [expect.objectContaining({
                parts: expect.arrayContaining([
                    expect.objectContaining({ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } })
                ])
            })]
        }));
    });
});
