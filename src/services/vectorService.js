const Groq = require('groq-sdk');
const Student = require('../models/student');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Generate embedding for text using Groq
const generateEmbedding = async (text) => {
    try {
        const response = await groq.embeddings.create({
            model: 'nomic-embed-text-v1',
            input: text
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('❌ Embedding error:', error.message);
        throw error;
    }
};

// Save student with embedding
const saveStudentWithEmbedding = async (studentData) => {
    try {
        // Create text to embed
        const text = `
            Student: ${studentData.name}
            Roll Number: ${studentData.rollNumber}
            Department: ${studentData.department}
            Year: ${studentData.year}
        `;

        // Generate embedding
        const embedding = await generateEmbedding(text);

        // Save to MongoDB with embedding
        const student = new Student({
            ...studentData,
            embedding: embedding
        });

        await student.save();
        console.log(`✅ Student saved with embedding: ${studentData.name}`);
        return student;

    } catch (error) {
        console.error('❌ Save student error:', error.message);
        throw error;
    }
};

// Search similar students using Vector Search
const searchSimilarStudents = async (query, limit = 5) => {
    try {
        // Generate embedding for search query
        const queryEmbedding = await generateEmbedding(query);

        // MongoDB Atlas Vector Search pipeline
        const results = await Student.aggregate([
            {
                $vectorSearch: {
                    index: 'vector_index',
                    path: 'embedding',
                    queryVector: queryEmbedding,
                    numCandidates: 100,
                    limit: limit
                }
            },
            {
                $project: {
                    name: 1,
                    rollNumber: 1,
                    department: 1,
                    year: 1,
                    email: 1,
                    phone: 1,
                    score: { $meta: 'vectorSearchScore' }
                }
            }
        ]);

        return results;

    } catch (error) {
        console.error('❌ Vector search error:', error.message);
        throw error;
    }
};

module.exports = {
    generateEmbedding,
    saveStudentWithEmbedding,
    searchSimilarStudents
};