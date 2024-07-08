// ==UserScript==
// @name         Vine Fuckers
// @namespace    http://tampermonkey.net/
// @version      1.5.13
// @updateURL    https://raw.githubusercontent.com/domischaen/Vine/main/ArticleNotifier.user.js
// @downloadURL  https://raw.githubusercontent.com/domischaen/Vine/main/ArticleNotifier.user.js
// @description  Vine Fuckers
// @author       Domi, Christof
// @match        https://www.amazon.de/vine/vine-items*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    const debug = false;

    const sendArticlesUrl = 'https://vinefuckers.de/api/articles';
    const searchArticlesUrl = 'https://vinefuckers.de/vinefuckersfuckedvine?query=';
    const lastChanceUrl = 'https://www.amazon.de/vine/vine-items?queue=last_chance';
    const encoreFixedUrl = 'https://www.amazon.de/vine/vine-items?queue=encore&pn=340846031';
    const encoreBaseUrl = 'https://www.amazon.de/vine/vine-items?queue=encore&pn=&cn=&page=';
    let currentEncorePage = localStorage.getItem('currentEncorePage') || 1;
    let isFetchingEncore = false;
    let isLastChance = true;
    let isRunning = false;
    const TAB_EXPIRATION_TIME = 60 * 1000;
    let lastActiveTimestamp = localStorage.getItem('lastActiveTimestamp') || 0;
    const tabId = Math.random().toString(36).substr(2, 9);

    function updateActiveTimestamp() {
        lastActiveTimestamp = Date.now();
        localStorage.setItem('lastActiveTimestamp', lastActiveTimestamp.toString());
    }

    function setActiveTabId(id) {
        localStorage.setItem('activeTabId', id);
    }

    function getActiveTabId() {
        return localStorage.getItem('activeTabId');
    }

    function getLastActiveTimestamp() {
        return parseInt(localStorage.getItem('lastActiveTimestamp')) || 0;
    }

    function checkActiveTab() {
        const activeTabId = getActiveTabId();
        const lastActiveTimestamp = getLastActiveTimestamp();
        const currentTimestamp = Date.now();

        if (!activeTabId || activeTabId === tabId) {
            setActiveTabId(tabId);
            updateActiveTimestamp();
            return true;
        } else if (currentTimestamp - lastActiveTimestamp > TAB_EXPIRATION_TIME) {
            setActiveTabId(tabId);
            updateActiveTimestamp();
            return true;
        }

        return false;
    }

 
    window.addEventListener('unload', () => {
        if (getActiveTabId() === tabId) {
            localStorage.removeItem('activeTabId');
        }
    });

    window.addEventListener('beforeunload', () => {
        if (getActiveTabId() === tabId) {
            localStorage.removeItem('activeTabId');
            console.log('Aktiver Tab wird geschlossen, activeTabId entfernt.');
        }
    });

    function getCategory(url) {
        if (url.includes('queue=last_chance')) {
            return 'vfa';
        } else if (url.includes('queue=encore')) {
            if (url.includes('pn=340846031')) {
                return 'lebensmittel';
            } else {
                return 'za';
            }
        }
        return null;
    }

    async function sendArticleInfos(articleInfos, category) {
        const articlesWithCategory = articleInfos.map(article => ({
            ...article,
            kategorie: category,
            isParentAsin: article.isParentAsin
        }));

        try {
            const response = await fetch(sendArticlesUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    articles: articlesWithCategory
                })
            });

            if (!response.ok) {
                throw new Error('Daten NICHT gesendet.');
            } else {
                console.log('Daten erfolgreich gesendet.');
            }

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

    function extractArticleInfos(elements) {
        let articleInfos = [];
        elements.forEach(element => {
            const id = element.getAttribute('data-recommendation-id');
            if (id) {
                const asin = element.querySelector('input[data-asin]').getAttribute('data-asin');
                const description = element.querySelector('.a-truncate-full').innerText.trim();
                const imageUrl = element.querySelector('img').src;
                const isParentAsin = element.querySelector('input[data-asin]').getAttribute('data-is-parent-asin') === 'true';
                const tax = (element.querySelector('input[data-asin]')?.getAttribute('data-tax') || null);

                articleInfos.push({
                    id,
                    asin,
                    description,
                    imageUrl,
                    isParentAsin,
                    tax
                });
            }
        });

        console.log('Extrahierte Artikelinfos:', articleInfos);
        return articleInfos;
    }

    function sendArticlesOnPageLoad() {
        const currentUrl = window.location.href;
        const elements = document.querySelectorAll('.vvp-item-tile, .vvp-item-tile.vine-element-new');
        const newInfos = extractArticleInfos(Array.from(elements));
        const category = getCategory(currentUrl);

        if (newInfos.length > 0) {
            sendArticleInfos(newInfos, category).then(result => {
                if (result && result.newArticleIds.length > 0) {
                    updateVvpItemsGrid(newInfos);
                }
            });
        }
    }

    async function checkForNewArticles(url) {
        console.log(`Überprüfe neue Artikel auf ${url}...`);
        try {
            const response = await fetch(url);
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const elements = doc.querySelectorAll('.vvp-item-tile, .vvp-item-tile.vine-element-new');
            const newInfos = extractArticleInfos(Array.from(elements));
            const category = getCategory(url);

            if (newInfos.length > 0) {
                const result = await sendArticleInfos(newInfos, category);
                if (result && result.newArticleIds.length > 0) {
                    updateVvpItemsGrid(newInfos);
                }
            }
        } catch (error) {
            console.error('Fehler beim Überprüfen neuer Artikel:', error);
        }
    }

    async function fetchEncorePage() {
        console.log(`Fetching encore page ${currentEncorePage}...`);
        updateEncorePageInfo(currentEncorePage);
        try {
            if (isFetchingEncore) return;
            isFetchingEncore = true;

            const response = await fetch(`${encoreBaseUrl}${currentEncorePage}`);
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const elements = doc.querySelectorAll('.vvp-item-tile, .vvp-item-tile.vine-element-new');
            const newInfos = extractArticleInfos(Array.from(elements));
            const category = getCategory(`${encoreBaseUrl}${currentEncorePage}`);

            if (newInfos.length > 0) {
                const result = await sendArticleInfos(newInfos, category);
                if (result && result.newArticleIds.length > 0) {
                    updateVvpItemsGrid(newInfos);
                }
            }

            const nextPageButton = doc.querySelector('.a-last');
            if (nextPageButton && nextPageButton.classList.contains('a-disabled')) {
                currentEncorePage = 1;
            } else {
                currentEncorePage++;
            }

            localStorage.setItem('currentEncorePage', currentEncorePage);
        } catch (error) {
            console.error('Fehler beim Abrufen der Encore-Seite:', error);
        } finally {
            isFetchingEncore = false;
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async function updateEncorePageInfo(page) {
        const pageInfoElement = document.querySelector('.page-info');
        if (pageInfoElement) {
            pageInfoElement.textContent = `Aktuelle ZA Seite: ${page}`;
        } else {
            const newPageInfoElement = document.createElement('div');
            newPageInfoElement.classList.add('page-info');
            newPageInfoElement.style.position = 'fixed';
            newPageInfoElement.style.bottom = '10px';
            newPageInfoElement.style.right = '10px';
            newPageInfoElement.style.padding = '10px';
            newPageInfoElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            newPageInfoElement.style.color = 'white';
            newPageInfoElement.style.fontSize = '14px';
            newPageInfoElement.style.borderRadius = '5px';
            newPageInfoElement.style.zIndex = '10000';
            newPageInfoElement.textContent = `Aktuelle ZA Seite: ${page}`;
            document.body.appendChild(newPageInfoElement);
        }
    }

    async function startFetchingArticles() {
        try {
            while (true) {
                if (!checkActiveTab()) {
                    console.log(`Tab nicht aktiv..`);
                    await sleep(5000);
                    continue;
                }
                updateActiveTimestamp();
                console.log(`Starte checkForNewArticles..`);
                await checkForNewArticles(isLastChance ? lastChanceUrl : encoreFixedUrl);
                isLastChance = !isLastChance;
                await sleep(getRandomInt(10000, 15000));
                if (!checkActiveTab()) {
                    await sleep(5000);
                    continue;
                }
                await fetchEncorePage();
                await sleep(getRandomInt(10000, 15000));
            }
        } catch (error) {
            console.error('Fehler beim Starten der Artikelüberwachung:', error);
        }
    }

    function injectSearchUI() {
        if (document.querySelector('.search-container')) return;

        const vvpItemsButtonContainer = document.getElementById('vvp-items-button-container');
        if (!vvpItemsButtonContainer) return;

        const searchContainer = document.createElement('span');
        searchContainer.classList.add('search-container');

        searchContainer.innerHTML = `
        <input type="text" id="searchQuery" placeholder="Suche Vine Produkte">
        <button id="searchButton">Suchen</button>
        <button id="resetSearchButton" style="margin-left: 5px;">Zurücksetzen</button>
    `;

        const style = document.createElement('style');
        style.textContent = `
        .search-container {
                align-items: center;
            }
            .search-container input {
                flex: 1;
                padding: 8px;
                font-size: 14px;
                margin-left: 5px;
                margin-right: 5px;
                width: 300px;
            }
            .search-container button {
                font-size: 14px;
                cursor: pointer;
            }
            .search-results-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 20px;
                margin-top: 20px;
                margin-bottom: 20px;
                clear: both; /* Verhindert das Verschieben neben andere Elemente */
                text-align: center;
            }
            .search-result-item {
                border: 1px solid #ccc;
                padding: 10px;
                border-radius: 5px;
                overflow: hidden; /* Verhindert, dass Inhalt außerhalb des Rahmens sichtbar wird */
            }
            .search-result-item img {
                max-width: 100%;
                height: auto;
                margin-bottom: 14px;
            }
            .search-result-item .title {
              height: 6em;
              overflow: hidden;
            }
        `;

        const searchResultsContainer = document.createElement('div');
        searchResultsContainer.classList.add('search-results-grid');
        vvpItemsButtonContainer.appendChild(searchContainer);
        vvpItemsButtonContainer.parentElement.insertAdjacentElement('afterend', searchResultsContainer);
        document.head.appendChild(style);

        const searchButton = document.getElementById('searchButton');
        const searchQueryInput = document.getElementById('searchQuery');
        const resetSearchButton = document.getElementById('resetSearchButton');

        searchButton.classList.add('a-button', 'a-button-primary');
        searchButton.style.padding = '5px 15px';
        resetSearchButton.classList.add('a-button');
        resetSearchButton.style.padding = '5px 15px';

        searchQueryInput.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter') {
                const query = searchQueryInput.value.trim();
                if (query === '') return;

                searchResultsContainer.innerHTML = 'Lädt...';
                try {
                    const response = await fetch(`${searchArticlesUrl}${encodeURIComponent(query)}`);
                    const data = await response.json();
                    displaySearchResults(data.articles);
                } catch (error) {
                    console.error('Fehler bei der Suche:', error);
                    searchResultsContainer.innerHTML = 'Fehler bei der Suche.';
                }
            }
        });

        searchButton.addEventListener('click', async () => {
            const query = searchQueryInput.value.trim();
            if (query === '') return;

            searchResultsContainer.innerHTML = 'Lädt...';
            try {
                const response = await fetch(`${searchArticlesUrl}${encodeURIComponent(query)}`);
                const data = await response.json();
                displaySearchResults(data.articles);
            } catch (error) {
                console.error('Fehler bei der Suche:', error);
                searchResultsContainer.innerHTML = 'Fehler bei der Suche.';
            }
        });

        resetSearchButton.addEventListener('click', () => {
            searchQueryInput.value = '';
            searchResultsContainer.innerHTML = '';
        });

        function formatTimestamp(timestamp) {
            const date = new Date(timestamp);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const seconds = date.getSeconds().toString().padStart(2, '0');

            return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
        }

        function displaySearchResults(articles) {
            if (articles.length === 0) {
                searchResultsContainer.innerHTML = 'Keine Ergebnisse gefunden.';
                return;
            }

            searchResultsContainer.innerHTML = '';
            articles.forEach(article => {
                const createdAtFormatted = formatTimestamp(article.createdAt);
                const lastSeenFormatted = formatTimestamp(article.lastSeen);
                const item = document.createElement('div');
                item.classList.add('search-result-item');
                item.innerHTML = `
                <img src="${article.imageUrl}" alt="${article.description}" />
                <p class="title"><a href="https://www.amazon.de/dp/${article.asin}" target="_blank">${article.description}</a></p>
                <p><span title="ASIN">${article.asin}</span> | <span title="Kategorie">${article.kategorie.toUpperCase()}</span> | <span title="Steuerwert">Tax: ${article.tax ? article.tax+' €' : '-'}</span></p>
                <p>
                  <span title="Zuerst gesehen">🆕 ${createdAtFormatted}</span><br>
                  <span title="Zuletzt gesehen">👁 ${lastSeenFormatted}</span>
                </p>
                <button class="view-vine-details-btn">Weitere Details</button>
            `;

                const viewVineDetailsButton = item.querySelector('.view-vine-details-btn');
                viewVineDetailsButton.classList.add('a-button', 'a-button-primary');
                viewVineDetailsButton.style.padding = '5px 15px';
    
                viewVineDetailsButton.addEventListener('click', () => {
                    let recommendationType;
                    if (article.kategorie === 'vfa') {
                        recommendationType = 'VENDOR_VINE_FOR_ALL';
                    } else if (article.kategorie === 'za') {
                        recommendationType = 'VINE_FOR_ALL';
                    } else {
                        recommendationType = 'VENDOR_TARGETED';
                    }
                    const vineElementTmp = document.createElement('div');
                    vineElementTmp.style.display = 'none';
                    vineElementTmp.innerHTML = `
                    <span class="a-button a-button-primary vvp-details-btn" id="a-autoid-0">
                        <span class="a-button-inner">
                            <input data-asin="${article.asin}" data-is-parent-asin="${article.isParentAsin}" data-recommendation-id="${article.id}" data-recommendation-type="${recommendationType}" class="a-button-input" type="submit" aria-labelledby="a-autoid-0-announce">
                            <span class="a-button-text" aria-hidden="true" id="a-autoid-0-announce">Weitere Details</span>
                        </span>
                    </span>
                `;
                    document.body.appendChild(vineElementTmp);

                    setTimeout(() => {
                        vineElementTmp.querySelector('input').click();
                        setTimeout(() => {
                            vineElementTmp.remove();
                        }, 200);
                    }, 500);
                });

                searchResultsContainer.appendChild(item);
            });
        }
    }

    function updateVvpItemsGrid(newArticles) {
        const vvpItemsGrid = document.getElementById('vvp-items-grid');
        if (!vvpItemsGrid) return;

        newArticles.forEach(article => {
            const item = document.createElement('div');
            item.classList.add('vvp-item-tile');
            item.innerHTML = `
                <img src="${article.imageUrl}" alt="${article.description}" />
                <p>${article.description}</p>
                <p>ID: ${article.tax}</p>
                <p>ASIN: ${article.asin}</p>
                <p>ID: ${article.id}</p>
                <p>Kategorie: ${article.kategorie}</p>
            `;
            vvpItemsGrid.insertBefore(item, vvpItemsGrid.firstChild);
        });
    }

    function duplicatePaginationElement() {
        const paginationElement = document.querySelector('.a-pagination').cloneNode(true);
        const targetElement = document.getElementById('vvp-items-grid');
        if (paginationElement && targetElement) {
            const paginationContainer = document.createElement('div');
            paginationContainer.style.display = 'flex';
            paginationContainer.style.justifyContent = 'center';
            paginationContainer.style.marginBottom = '20px';
            paginationContainer.appendChild(paginationElement);
            targetElement.parentNode.insertBefore(paginationContainer, targetElement);
        } else {
            console.error('Pagination element or target element not found');
        }
    }

    function injectTaxInterception() {
        console.log(`[VF]`,`Tax Interception Injectet`);
        const vvpItems = document.getElementById('vvp-items-grid').querySelectorAll('.vvp-item-tile');
        let elements = []
        vvpItems.forEach(element => {
            if(debug){console.log(`[VF]`,element)};
            element.querySelector('.vvp-item-tile-content > .vvp-details-btn').addEventListener('click', () => {

                // Delete the Tax Value to detect the correct Value for the next Product
                const popupTaxContainer = '#vvp-product-details-modal--tax-value-string';
                document.querySelector(popupTaxContainer).textContent = "";

                if(debug){console.log(`[VF]`,element)};
                waitForHtmlElmement('#vvp-product-details-modal--tax-value-string', (selector) => {

                    waitForHtmlElementWithContent('#vvp-product-details-modal--tax-value-string', async (elem) => {
                        const taxWert = parseFloat(elem.textContent.replace('€', '').trim());
                        if(debug){console.log(`[VF]`,taxWert)};
                        console.log('[VF]', `Tax Wert des Artikels: ${taxWert}`);
                        element.querySelector('input[data-asin]').setAttribute('data-tax', taxWert);

                        elements.push(element);
                        const category = getCategory(window.location.href);
                        let newInfos = extractArticleInfos(elements);
                        if(debug){console.log('[VF]',newInfos)};
                        console.log('[VF]',category);

                        const result = await sendArticleInfos(newInfos, category);
                        if (result && result.newArticleIds.length > 0) {
                            updateVvpItemsGrid(newInfos);
                        }
                        elements = [];
                    })
                });
            });
        })
        console.log(vvpItems);
    }



    async function init() {
        sendArticlesOnPageLoad();
        injectSearchUI();
        waitForHtmlElmement(('.a-pagination'), () => {
            duplicatePaginationElement();
        });
        if(!window.location.href.includes('queue=potluck')){
            injectTaxInterception();
        }
        await sleep(2000);
        startFetchingArticles();
    }

    const currentUrl = window.location.href;
    if (currentUrl.includes('vine-data=')) {
        const startIndex = currentUrl.indexOf('vine-data=') + 10;
        const endIndex = currentUrl.indexOf('&', startIndex);
        const vineDataParam = endIndex === -1 ? currentUrl.substring(startIndex) : currentUrl.substring(startIndex, endIndex);

        try {
            const {
                asin,
                recommendationId,
                isParentAsin,
                kategorie
            } = JSON.parse(decodeURIComponent(vineDataParam));

            let recommendationType;
             if (kategorie === 'vfa') {
                 recommendationType = 'VENDOR_VINE_FOR_ALL';
             } else if (kategorie === 'za') {
                  recommendationType = 'VINE_FOR_ALL';
             } else {
                 recommendationType = 'VENDOR_TARGETED';
            }

            const vineElementTmp = document.createElement('div');
            vineElementTmp.style.display = 'none';
            vineElementTmp.innerHTML = `
                <span class="a-button a-button-primary vvp-details-btn" id="a-autoid-0">
                    <span class="a-button-inner">
                        <input data-asin="${asin}" data-is-parent-asin="${isParentAsin}" data-recommendation-id="${recommendationId}" data-recommendation-type="recommendationType" class="a-button-input" type="submit" aria-labelledby="a-autoid-0-announce">
                        <span class="a-button-text" aria-hidden="true" id="a-autoid-0-announce">Weitere Details</span>
                    </span>
                </span>
            `;
            document.body.appendChild(vineElementTmp);

            setTimeout(() => {
                vineElementTmp.querySelector('input').click();
                setTimeout(() => {
                    vineElementTmp.remove();
                }, 200);
            }, 500);
        } catch (error) {
            console.error('Fehler beim Verarbeiten von vine-data:', error);
        }
    }

    init();

    /**
    * Waits until a HTML Element exists ans fires callback if it is found
    * @param {string} selector querySelector
    * @param {function} cb Callback Function
    * @param {object} [altDocument] Alternativ document root
    */
    async function waitForHtmlElmement(selector, cb, altDocument = document) {
        if (typeof(selector) != 'string') throw new Error('waitForHtmlElement(): selector is not defined or is not type of string');
        if (typeof(cb) != 'function') throw new Error('waitForHtmlElement(): cb is not defined or is not type of string');

        if (altDocument.querySelector(selector)) {
            cb(altDocument.querySelector(selector));
            return;
        }

        const _observer = new MutationObserver(mutations => {
            if (altDocument.querySelector(selector)) {
                _observer.disconnect();
                cb(altDocument.querySelector(selector));
                return;
            }
        });

        _observer.observe(altDocument.body || altDocument, {
            childList: true,
            subtree: true
        });
    }

    /**
 * Waits until a HTML Element's textContent is not empty and fires callback if it is found
 * @param {string} selector querySelector
 * @param {function} cb Callback Function
 * @param {object} [altDocument] Alternative document root
 */
    async function waitForHtmlElementWithContent(selector, cb, altDocument = document) {
        if (typeof(selector) !== 'string') throw new Error('waitForHtmlElementWithContent(): selector is not defined or is not type of string');
        if (typeof(cb) !== 'function') throw new Error('waitForHtmlElementWithContent(): cb is not defined or is not type of function');

        const checkElementContent = () => {
            const element = altDocument.querySelector(selector);
            if (element && element.textContent.trim() !== "") {
                cb(element);
                return true;
            }
            return false;
        };

        if (checkElementContent()) return;

        const _observer = new MutationObserver(mutations => {
            if (checkElementContent()) {
                _observer.disconnect();
            }
        });

        _observer.observe(altDocument.body || altDocument, {
            childList: true,
            subtree: true
        });
    }


})();
