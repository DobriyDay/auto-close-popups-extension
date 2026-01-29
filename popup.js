// popup.js — с живой проверкой селектора на текущей странице

const domainInput = document.getElementById('domainInput');
const selectorInput = document.getElementById('selectorInput');
const addBtn = document.getElementById('addBtn');
const clearBtn = document.getElementById('clearBtn');
const rulesList = document.getElementById('rulesList');
const status = document.getElementById('status');
const selectorStatus = document.getElementById('selectorStatus');

const TEMP_DOMAIN_KEY = 'tempDomainInput';
const TEMP_SELECTOR_KEY = 'tempSelectorInput';

async function restoreInputs() {
    const result = await chrome.storage.local.get([TEMP_DOMAIN_KEY, TEMP_SELECTOR_KEY]);
    domainInput.value = result[TEMP_DOMAIN_KEY] || '';
    selectorInput.value = result[TEMP_SELECTOR_KEY] || '';

    // Запустить проверку селектора сразу после восстановления
    if (selectorInput.value) {
        checkSelectorOnCurrentPage(selectorInput.value);
    }
}

// Проверка селектора на текущей вкладке
async function checkSelectorOnCurrentPage(selector) {
    if (!selector.trim()) {
        updateSelectorStatus('', '');
        return;
    }

    try {
        // Проверяем синтаксис селектора
        document.querySelector(selector); // Это не выполнится, но проверит синтаксис в popup-контексте

        // Получаем активную вкладку
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
            updateSelectorStatus('⚠️ Недоступно на этой странице', 'warning');
            return;
        }

        // Отправляем запрос контент-скрипту для проверки наличия элемента
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'checkSelectorExists',
            selector: selector
        });

        if (response?.exists) {
            updateSelectorStatus('✅ Селектор найден!', 'success');
        } else {
            updateSelectorStatus('❌ Селектор не найден', 'error');
        }
    } catch (syntaxError) {
        updateSelectorStatus('⚠️ Неверный синтаксис селектора', 'error');
    }
}

function updateSelectorStatus(message, type) {
    selectorStatus.textContent = message;
    selectorStatus.className = type;
    selectorStatus.style.display = message ? 'block' : 'none';
}

function setupInputListeners() {
    const saveDebounce = (function () {
        let timeout;
        return (key, value) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                chrome.storage.local.set({ [key]: value });
            }, 300);
        };
    })();

    domainInput.addEventListener('input', (e) => {
        saveDebounce(TEMP_DOMAIN_KEY, e.target.value.trim());
    });

    // Проверка селектора при вводе (с задержкой)
    let checkTimeout;
    selectorInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        saveDebounce(TEMP_SELECTOR_KEY, value);

        clearTimeout(checkTimeout);
        checkTimeout = setTimeout(() => {
            checkSelectorOnCurrentPage(value);
        }, 500); // ждём 500 мс после окончания ввода
    });
}

async function tryClickOnCurrentTab(domain, selector) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) return false;

    try {
        const url = new URL(tab.url);
        const currentDomain = url.hostname.replace(/^www\./, '');
        const ruleDomain = domain.replace(/^www\./, '');

        if (currentDomain !== ruleDomain && !currentDomain.endsWith('.' + ruleDomain)) {
            return false;
        }

        const result = await chrome.tabs.sendMessage(tab.id, {
            action: 'tryClickElement',
            selector: selector
        });

        return result?.clicked === true;
    } catch (error) {
        console.warn('Не удалось проверить элемент на текущей вкладке:', error);
        return false;
    }
}

addBtn.addEventListener('click', async () => {
    const domain = domainInput.value.trim();
    const selector = selectorInput.value.trim();

    if (!domain || !selector) {
        showStatus('Пожалуйста, заполните оба поля', 'error');
        return;
    }

    if (!isValidDomain(domain)) {
        showStatus('Неверный формат домена', 'error');
        return;
    }

    // Проверим синтаксис селектора перед добавлением
    try {
        document.querySelector(selector);
    } catch (e) {
        showStatus('Неверный синтаксис CSS селектора', 'error');
        return;
    }

    const result = await chrome.storage.local.get(['autoClickRules']);
    const rules = result.autoClickRules || [];

    const exists = rules.some(
        (rule) =>
            rule.domain.toLowerCase() === domain.toLowerCase() &&
            rule.selector === selector
    );

    if (exists) {
        showStatus('Такое правило уже существует', 'error');
        return;
    }

    rules.push({
        domain: domain.toLowerCase(),
        selector: selector,
        id: Date.now(),
    });

    await chrome.storage.local.set({ autoClickRules: rules });
    await chrome.storage.local.remove([TEMP_DOMAIN_KEY, TEMP_SELECTOR_KEY]);

    const clicked = await tryClickOnCurrentTab(domain, selector);
    window.close();
});

clearBtn.addEventListener('click', async () => {
    if (confirm('Вы уверены, что хотите удалить все правила?')) {
        await chrome.storage.local.set({ autoClickRules: [] });
        await chrome.storage.local.remove([TEMP_DOMAIN_KEY, TEMP_SELECTOR_KEY]);
        domainInput.value = '';
        selectorInput.value = '';
        loadRules();
        showStatus('Все правила удалены', 'success');
    }
});

async function loadRules() {
    const result = await chrome.storage.local.get(['autoClickRules']);
    const rules = result.autoClickRules || [];

    rulesList.innerHTML = '';

    if (rules.length === 0) {
        rulesList.innerHTML =
            '<div style="text-align: center; padding: 20px; color: rgba(255,255,255,0.6);">Нет добавленных правил</div>';
        return;
    }

    rules.forEach((rule) => {
        const ruleElement = document.createElement('div');
        ruleElement.className = 'rule-item';
        ruleElement.innerHTML = `
      <div class="rule-header">
        <span class="rule-domain">${rule.domain}</span>
        <button class="delete-btn" data-id="${rule.id}">✕</button>
      </div>
      <div class="rule-selector">${rule.selector}</div>
    `;

        rulesList.appendChild(ruleElement);
    });

    document.querySelectorAll('.delete-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.getAttribute('data-id');
            const result = await chrome.storage.local.get(['autoClickRules']);
            const rules = result.autoClickRules || [];

            const updatedRules = rules.filter((rule) => rule.id != id);
            await chrome.storage.local.set({ autoClickRules: updatedRules });

            loadRules();
            showStatus('Правило удалено', 'success');
        });
    });
}

function showStatus(message, type) {
    status.textContent = message;
    status.className = 'status ' + type;
    status.style.display = 'block';

    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}

function isValidDomain(domain) {
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
}

function isValidSelector(selector) {
    if (!selector || typeof selector !== 'string') return false;
    return /^[.#\[\]*a-zA-Z]/.test(selector.trim());
}

async function init() {
    restoreInputs();
    loadRules();
    setupInputListeners();
}

init();
domainInput.focus();