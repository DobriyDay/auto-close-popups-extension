// Проверка существования селектора на странице
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkSelectorExists') {
        const { selector } = request;
        let exists = false;

        try {
            const elements = document.querySelectorAll(selector);
            // Проверяем, есть ли хотя бы один видимый элемент
            exists = Array.from(elements).some(el => isElementVisible(el));
        } catch (error) {
            // Неверный селектор — вернём false
            exists = false;
        }

        sendResponse({ exists });
        return true;
    }

    if (request.action === 'tryClickElement') {
        const { selector } = request;
        let clicked = false;

        try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (!clicked && isElementVisible(element)) {
                    element.click();
                    clicked = true;
                    console.log('Мгновенный клик по элементу:', selector);
                }
            });
        } catch (error) {
            console.error('Ошибка при мгновенном клике:', error);
        }

        sendResponse({ clicked });
        return true;
    }
});