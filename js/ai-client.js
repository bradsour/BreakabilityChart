import { loadAIConfig } from './storage-manager.js';

const PROMPT = 'Analyze this image and extract the Mass and Resistance values. Return ONLY JSON: {"mass": number, "resistance": number}. IMPORTANT: When reporting Mass, do not worry about formatting. Even if the numbers look spread out, provide them as a single continuous string of digits.';

function getConfig() {
    const config = loadAIConfig() || {};
    return {
        provider: config.provider || 'ollama',
        ollamaEndpoint: (config.ollamaEndpoint || 'http://10.10.10.31:11434').replace(/\/+$/, ''),
        model: config.model || 'llama3.2-vision',
        apiKey: config.apiKey || ''
    };
}

function extractJson(text) {
    if (!text || typeof text !== 'string') return null;
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/i, '').replace(/```$/i, '').trim();
    }
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return null;
    const jsonText = cleaned.slice(first, last + 1);
    try {
        return JSON.parse(jsonText);
    } catch (err) {
        return null;
    }
}

export async function requestMiningData(base64Image) {
    const config = getConfig();

    if (config.provider !== 'ollama') {
        throw new Error('Only Ollama is supported right now.');
    }

    const payload = {
        model: config.model,
        prompt: PROMPT,
        stream: false,
        options: {
            temperature: 0
        },
        images: [base64Image.replace(/^data:image\/\w+;base64,/, '')]
    };

    const response = await fetch(`${config.ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    const parsed = extractJson(data?.response || '');
    if (!parsed) {
        throw new Error('Unable to parse JSON response.');
    }

    return parsed;
}
