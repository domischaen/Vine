// ==UserScript==
// @name         New Article Notifier
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Vine Fuckers
// @author       Domi
// @match        https://www.amazon.de/vine/vine-items?queue=last_chance*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const serverUrl = 'https://vinefuckers.de/api/articles';
    const minInterval = 3000;
    const maxInterval = 10000;
    let intervalId;

    async function sendArticleInfos(articleInfos) {
    try {
        const response = await fetch(serverUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ articles: articleInfos })
        });
        if (!response.ok) {
            throw new Error('Daten NICHT gesendet.');
        } else {
            console.log('Daten erfolgreich gesendet.');
        }

        // Überprüfen, ob die Antwort JSON ist
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return data;
        } else {
            console.warn('Antwort ist kein JSON:', await response.text());
            return null;
        }
    } catch (error) {
        console.error('Fehler beim Senden der Artikelinformationen:', error);
    }
}


    function showNotification(title, body, imageUrl, linkUrl) {
        if (Notification.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: imageUrl,
                data: { url: linkUrl }
            }).onclick = function(event) {
                event.preventDefault();
                window.open(event.target.data.url, '_blank');
            };
        }
    }

    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }

    function extractArticleInfos(elements) {
        let articleInfos = [];
        elements.forEach(element => {
            const id = element.getAttribute('data-recommendation-id');
            if (id) {
                const asin = element.querySelector('input[data-asin]').getAttribute('data-asin');
                const description = element.querySelector('.a-truncate-full').innerText.trim();
                const imageUrl = element.querySelector('img').src;
                articleInfos.push({ id, asin, description, imageUrl });
            }
        });
        return articleInfos;
    }

    async function checkForNewArticles(newInfos, elements) {
        const result = await sendArticleInfos(newInfos);
        if (result && result.newArticleIds.length > 0) {
            result.newArticleIds.forEach(id => {
                const element = elements.find(el => el.getAttribute('data-recommendation-id') === id);
                if (element) {
                    const imageUrl = element.querySelector('img').src;
                    const title = element.querySelector('.a-truncate-full').innerText.trim();
                    const asin = element.querySelector('input[data-asin]').getAttribute('data-asin');
                    const linkUrl = `https://www.amazon.de/dp/${asin}`;
                    showNotification('Neuer Artikel in Verfügbar für alle', title, imageUrl, linkUrl);
                }
            });
        }
    }

    let infos = extractArticleInfos(document.querySelectorAll('.vvp-item-tile, .vvp-item-tile.ave-element-new'));
    checkForNewArticles(infos, Array.from(document.querySelectorAll('.vvp-item-tile, .vvp-item-tile.ave-element-new')));

    function setReloadInterval() {
        const interval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
        let timeRemaining = Math.floor(interval / 1000);

        intervalId = setInterval(() => {
            if (timeRemaining <= 0) {
                clearInterval(intervalId);
                window.location.reload();
            } else {
                timeRemaining -= 1;
                statusElement.innerText = `New Article Notifier is active. Reloading in ${timeRemaining} seconds.`;
            }
        }, 1000);
    }

    function startInterval() {
        if (!intervalId) {
            setReloadInterval();
            localStorage.setItem('notifierActive', 'true');
            statusElement.innerText = 'New Article Notifier is active.';
        }
    }

    function stopInterval() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            statusElement.innerText = 'New Article Notifier is inactive.';
            localStorage.setItem('notifierActive', 'false');
        }
    }

    const statusElement = document.createElement('div');
    statusElement.style.position = 'fixed';
    statusElement.style.bottom = '10px';
    statusElement.style.right = '10px';
    statusElement.style.padding = '10px';
    statusElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    statusElement.style.color = 'white';
    statusElement.style.fontSize = '14px';
    statusElement.style.borderRadius = '5px';
    statusElement.style.zIndex = '10000';
    statusElement.innerText = 'New Article Notifier is inactive.';

    document.body.appendChild(statusElement);

    statusElement.addEventListener('click', function() {
        if (intervalId) {
            stopInterval();
        } else {
            startInterval();
        }
    });

    if (localStorage.getItem('notifierActive') === 'true') {
        startInterval();
    }
})();
