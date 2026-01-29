// Фоновый скрипт для управления расширением

// Получение настроек из хранилища
chrome.storage.local.get(['autoClickRules'], (result) => {
    const rules = result.autoClickRules || [];
    console.log('Загружены правила:', rules);
});

// Прослушивание сообщений от контент-скрипта
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getRules') {
        chrome.storage.local.get(['autoClickRules'], (result) => {
            sendResponse({ rules: result.autoClickRules || [] });
        });
        return true;
    }

    if (request.action === 'elementClicked') {
        console.log('Элемент нажат на странице:', sender.tab.url);
    }

    return true;
});