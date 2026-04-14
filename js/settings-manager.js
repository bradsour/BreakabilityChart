import { saveAIConfig, loadAIConfig } from './storage-manager.js';

const DEFAULT_CONFIG = {
    provider: 'ollama',
    ollamaEndpoint: 'http://10.10.10.31:11434',
    apiKey: '',
    model: 'llama3.2-vision'
};

const PROVIDERS = ['ollama', 'openai', 'gemini'];

let aiConfig = { ...DEFAULT_CONFIG };

function normalizeConfig(loaded) {
    if (!loaded || typeof loaded !== 'object') {
        return { ...DEFAULT_CONFIG };
    }

    const provider = PROVIDERS.includes(loaded.provider) ? loaded.provider : 'ollama';

    return {
        provider,
        ollamaEndpoint: typeof loaded.ollamaEndpoint === 'string' && loaded.ollamaEndpoint.trim()
            ? loaded.ollamaEndpoint.trim()
            : DEFAULT_CONFIG.ollamaEndpoint,
        apiKey: typeof loaded.apiKey === 'string' ? loaded.apiKey : '',
        model: typeof loaded.model === 'string' && loaded.model.trim()
            ? loaded.model.trim()
            : DEFAULT_CONFIG.model
    };
}

function applyConfigToForm(config, elements) {
    elements.providerSelect.value = config.provider;
    elements.endpointInput.value = config.ollamaEndpoint;
    elements.apiKeyInput.value = '';
    elements.apiKeyInput.placeholder = config.apiKey ? 'Saved (hidden)' : 'Your API key';
    elements.modelInput.value = config.model;
    elements.apiKeyInput.type = elements.showApiKeyToggle.checked ? 'text' : 'password';
    toggleProviderFields(config.provider, elements);
}

function readConfigFromForm(elements) {
    return normalizeConfig({
        provider: elements.providerSelect.value,
        ollamaEndpoint: elements.endpointInput.value,
        apiKey: elements.apiKeyInput.value || aiConfig.apiKey,
        model: elements.modelInput.value
    });
}

function setStatus(elements, message, isError = false) {
    if (!elements.statusLine) return;
    elements.statusLine.textContent = message;
    elements.statusLine.dataset.status = isError ? 'error' : 'ok';
}

function toggleProviderFields(provider, elements) {
    const showOllama = provider === 'ollama';
    if (elements.ollamaFields) {
        elements.ollamaFields.style.display = showOllama ? 'block' : 'none';
    }
    if (elements.apiKeyField) {
        elements.apiKeyField.style.display = showOllama ? 'none' : 'block';
    }
    if (elements.modelSelect && elements.modelInput && elements.modelHint) {
        if (showOllama) {
            elements.modelSelect.classList.remove('hidden');
            elements.modelInput.classList.add('hidden');
            elements.modelHint.textContent = 'Pick a model from your local Ollama list.';
        } else {
            elements.modelSelect.classList.add('hidden');
            elements.modelInput.classList.remove('hidden');
            elements.modelHint.textContent = 'Enter a model name for the selected provider.';
        }
    }
}

function updateTestButtonState(elements) {
    if (!elements.testBtn) return;
    const provider = elements.providerSelect.value;
    const endpoint = elements.endpointInput.value.trim();
    const apiKey = (elements.apiKeyInput.value || aiConfig.apiKey || '').trim();
    const isReady = provider === 'ollama' ? Boolean(endpoint) : Boolean(apiKey);
    elements.testBtn.disabled = !isReady;
}

async function refreshOllamaModels(elements) {
    const endpoint = elements.endpointInput.value.trim().replace(/\/+$/, '');
    if (!endpoint) {
        setStatus(elements, 'Enter an Ollama endpoint to load models.', true);
        return;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Ollama responded with ${response.status}`);
        }

        const data = await response.json();
        const models = Array.isArray(data?.models) ? data.models : [];
        const names = models.map(m => m.name).filter(Boolean);

        elements.modelSelect.innerHTML = '';
        if (names.length === 0) {
            elements.modelSelect.classList.add('hidden');
            elements.modelInput.classList.remove('hidden');
            elements.modelInput.value = elements.modelInput.value || DEFAULT_CONFIG.model;
            setStatus(elements, 'No Ollama models found. Enter a model name manually.', true);
            return;
        }

        names.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            elements.modelSelect.appendChild(option);
        });

        const preferred = names.includes(elements.modelInput.value) ? elements.modelInput.value : names[0];
        elements.modelSelect.value = preferred;
        elements.modelInput.value = preferred;
        setStatus(elements, `Loaded ${names.length} Ollama model(s).`, false);
    } catch (err) {
        setStatus(elements, `Failed to load Ollama models: ${err.message || err}`, true);
    }
}

export function getAIConfig() {
    return { ...aiConfig };
}

export function setupSettingsUI() {
    const settingsBtn = document.getElementById('settingsBtn');
    const modal = document.getElementById('settingsModal');
    const closeBtn = document.getElementById('closeSettingsBtn');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const resetBtn = document.getElementById('resetSettingsBtn');
    const testBtn = document.getElementById('testSettingsBtn');
    const providerSelect = document.getElementById('providerSelect');
    const endpointInput = document.getElementById('endpointInput');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const modelInput = document.getElementById('modelInput');
    const modelSelect = document.getElementById('modelSelect');
    const modelHint = document.getElementById('modelHint');
    const showApiKeyToggle = document.getElementById('showApiKeyToggle');
    const statusLine = document.getElementById('settingsStatus');
    const ollamaFields = document.getElementById('ollamaFields');
    const apiKeyField = document.getElementById('apiKeyField');

    if (!settingsBtn || !modal || !closeBtn || !saveBtn || !resetBtn || !testBtn ||
        !providerSelect || !endpointInput || !apiKeyInput || !modelInput || !modelSelect ||
        !modelHint || !showApiKeyToggle) {
        console.warn('Settings UI elements not found');
        return;
    }

    const elements = {
        providerSelect,
        endpointInput,
        apiKeyInput,
        modelInput,
        modelSelect,
        modelHint,
        showApiKeyToggle,
        statusLine,
        ollamaFields,
        apiKeyField,
        testBtn
    };

    aiConfig = normalizeConfig(loadAIConfig());
    window.aiConfig = { ...aiConfig };
    applyConfigToForm(aiConfig, elements);
    showApiKeyToggle.disabled = true;
    refreshOllamaModels(elements);
    updateTestButtonState(elements);

    settingsBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        setStatus(elements, 'Loaded saved settings.', false);
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.classList.add('hidden');
        }
    });

    providerSelect.addEventListener('change', () => {
        const newProvider = providerSelect.value;
        toggleProviderFields(newProvider, elements);
        setStatus(elements, 'Provider updated.', false);
        if (newProvider === 'ollama') {
            refreshOllamaModels(elements);
        }
        updateTestButtonState(elements);
    });

    showApiKeyToggle.addEventListener('change', () => {
        apiKeyInput.type = showApiKeyToggle.checked ? 'text' : 'password';
    });

    endpointInput.addEventListener('input', () => updateTestButtonState(elements));
    apiKeyInput.addEventListener('input', () => {
        showApiKeyToggle.disabled = apiKeyInput.value.trim().length === 0;
        if (showApiKeyToggle.disabled) {
            showApiKeyToggle.checked = false;
            apiKeyInput.type = 'password';
        }
        updateTestButtonState(elements);
    });
    endpointInput.addEventListener('blur', () => {
        if (providerSelect.value === 'ollama') {
            refreshOllamaModels(elements);
        }
    });

    modelSelect.addEventListener('change', () => {
        modelInput.value = modelSelect.value;
    });

    testBtn.addEventListener('click', async () => {
        const testConfig = readConfigFromForm(elements);
        setStatus(elements, 'Testing connection...', false);
        testBtn.disabled = true;

        try {
            if (testConfig.provider === 'ollama') {
                const trimmed = testConfig.ollamaEndpoint.replace(/\/+$/, '');
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);
                const response = await fetch(`${trimmed}/api/tags`, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`Ollama responded with ${response.status}`);
                }

                setStatus(elements, 'Ollama connection OK.', false);
            } else {
                if (!testConfig.apiKey.trim()) {
                    throw new Error('API key is required for cloud providers.');
                }
                setStatus(elements, 'API key present. Connection test depends on provider CORS.', false);
            }
        } catch (err) {
            setStatus(elements, `Test failed: ${err.message || err}`, true);
        } finally {
            updateTestButtonState(elements);
        }
    });

    saveBtn.addEventListener('click', () => {
        const nextConfig = readConfigFromForm(elements);
        aiConfig = nextConfig;
        saveAIConfig(aiConfig);
        window.aiConfig = { ...aiConfig };
        apiKeyInput.value = '';
        apiKeyInput.placeholder = aiConfig.apiKey ? 'Saved (hidden)' : 'Your API key';
        showApiKeyToggle.checked = false;
        showApiKeyToggle.disabled = true;
        apiKeyInput.type = 'password';
        setStatus(elements, 'Settings saved locally.', false);
    });

    resetBtn.addEventListener('click', () => {
        aiConfig = { ...DEFAULT_CONFIG };
        saveAIConfig(aiConfig);
        window.aiConfig = { ...aiConfig };
        applyConfigToForm(aiConfig, elements);
        setStatus(elements, 'Reset to defaults.', false);
    });
}
