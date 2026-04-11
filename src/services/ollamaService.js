const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const ollamaApiKey = process.env.OLLAMA_API_KEY;

async function queryOllama(prompt) {
    try {
        const response = await axios.post(
            'https://api.ollama.com/v1/chat',
            {
                model: 'chat', // Replace with the model name you want to use
                prompt: prompt,
            },
            {
                headers: {
                    Authorization: `Bearer ${ollamaApiKey}`,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error querying Ollama API:', error.message);
        throw error;
    }
}

module.exports = { queryOllama };