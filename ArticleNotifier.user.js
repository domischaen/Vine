// ==UserScript==
// @name         Vine Fuckers
// @namespace    http://tampermonkey.net/
// @version      1.5.8
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

    const debug = true;

    const sendArticlesUrl = 'https://vinefuckers.de/api/articles';
    const searchArticlesUrl = 'https://vinefuckers.de/vinefuckersfuckedvine?query=';
    const lastChanceUrl = 'https://www.amazon.de/vine/vine-items?queue=last_chance';
    const encoreFixedUrl = 'https://www.amazon.de/vine/vine-items?queue=encore&pn=340846031';
    const encoreBaseUrl = 'https://www.amazon.de/vine/vine-items?queue=encore&pn=&cn=&page=';
    let currentEncorePage = localStorage.getItem('currentEncorePage') || 1;
    let isFetchingEncore = false;
    let isLastChance = true;
    let isRunning = false;
    let scriptVersion = (GM_info?.script?.version);
    let favorites = JSON.parse(localStorage.getItem('vf-favorites')) || [];

    const tabId = Math.random().toString(36).substr(2, 9);

    function setActiveTabId(id) {
        localStorage.setItem('activeTabId', id);
    }

    function getActiveTabId() {
        return localStorage.getItem('activeTabId');
    }

    function checkActiveTab() {
        const activeTabId = getActiveTabId();
        if (!activeTabId || activeTabId === tabId) {
            setActiveTabId(tabId);
            return true;
        }
        return false;
    }

    window.addEventListener('storage', (event) => {
        if (event.key === 'activeTabId' && event.newValue !== tabId) {
            console.log('Ein anderer Tab ist aktiv, Skript wird nicht ausgeführt.');
            stopFetchingArticles();
        }
    });

    window.addEventListener('unload', () => {
        if (getActiveTabId() === tabId) {
            localStorage.removeItem('activeTabId');
        }
    });

    function stopFetchingArticles() {
        isRunning = false;
        console.log('Artikelüberwachung gestoppt.');
    }

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
                document.querySelector('.page-info').style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
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
            document.querySelector('.page-info').style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
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
            pageInfoElement.textContent = `v${scriptVersion} - Aktuelle ZA Seite: ${page}`;
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
            newPageInfoElement.textContent = `v${scriptVersion} - Aktuelle ZA Seite: ${page}`;
            document.body.appendChild(newPageInfoElement);
        }
    }

    async function startFetchingArticles() {
        isRunning = true;
        try {
            while (isRunning) {
                if (!checkActiveTab()) {
                    await sleep(5000);
                    continue;
                }
                await checkForNewArticles(isLastChance ? lastChanceUrl : encoreFixedUrl);
                isLastChance = !isLastChance;
                await sleep(getRandomInt(10000, 15000));
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
                <p><a href="https://www.amazon.de/dp/${article.asin}" target="_blank">${article.description}</a></p>
                <p>ASIN: ${article.asin}</p>
                <p>Tax: ${article.tax}</p>
                <p>Kategorie: ${article.kategorie}</p>
                <p>Zuerst gesehen: ${createdAtFormatted}</p>
                <p>Zuletzt gesehen: ${lastSeenFormatted}</p>
                <button class="view-vine-details-btn">Weitere Details</button>
            `;

                const viewVineDetailsButton = item.querySelector('.view-vine-details-btn');
                viewVineDetailsButton.classList.add('a-button', 'a-button-primary');
                viewVineDetailsButton.style.padding = '5px 15px';
                viewVineDetailsButton.style.marginTop = '10px';

                viewVineDetailsButton.addEventListener('click', () => {
                    const vineElementTmp = document.createElement('div');
                    vineElementTmp.style.display = 'none';
                    vineElementTmp.innerHTML = `
                    <span class="a-button a-button-primary vvp-details-btn" id="a-autoid-0">
                        <span class="a-button-inner">
                            <input data-asin="${article.asin}" data-is-parent-asin="${article.isParentAsin}" data-recommendation-id="${article.id}" data-recommendation-type="VENDOR_TARGETED" class="a-button-input" type="submit" aria-labelledby="a-autoid-0-announce">
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

                        const result = await sendArticleInfos(newInfos, category);
                        if (result && result.newArticleIds.length > 0) {
                            updateVvpItemsGrid(newInfos);
                        }
                        elements = [];
                    })
                });
            });
        })
        if(debug){console.log('[VF]',vvpItems)};
    }

    function addFavSystem() {

        //vvp-items-button--seller

        const vvpItemsButtonContainer = document.getElementById('vvp-items-button-container');
        if (!vvpItemsButtonContainer) return;

        const favPagebutton = document.createElement('span');
        favPagebutton.id = 'vvp-items-button--vf-favs';
        favPagebutton.classList.add('a-button', 'a-button-normal', 'a-button-toggle');

        favPagebutton.innerHTML = `
        <span class="a-button-inner">
                <a role="radio" aria-checked="false" class="a-button-text">Favoriten</a>
        </span>`;

        const targetElement = vvpItemsButtonContainer.querySelector('#vvp-items-button--seller');
        //vvpItemsButtonContainer.appendChild(favPagebutton);
        targetElement.parentNode.insertBefore(favPagebutton, targetElement.nextSibling)

        favPagebutton.addEventListener('click', () => {
            vvpItemsButtonContainer.querySelectorAll('span').forEach((elem) => {
                elem.classList.remove('a-button-selected');
            });
            favPagebutton.classList.add('a-button-selected');

            const itemGridContainer = document.body.querySelector('.a-section.vvp-items-container');
            itemGridContainer.querySelectorAll('#vvp-browse-nodes-container').forEach((elem) => {elem.remove()})
            itemGridContainer.querySelectorAll('.a-pagination').forEach((elem) => {elem.parentNode.remove()});
            const itemGrid = itemGridContainer.querySelector('#vvp-items-grid');
            itemGrid.innerHTML = '';
            const productCount = itemGridContainer.querySelector('p');
            productCount.innerHTML = `Anzeigen von <strong>${favorites.length}</strong> Ergebnissen`


            if(favorites.length != 0){
                favorites.forEach((elem) => {
                    const productTile = document.createElement('div');
                    productTile.classList.add('vvp-item-tile');
                    productTile.setAttribute('data-recommendation-id', elem.id);
                    productTile.setAttribute('data-img-url', elem.imageUrl);

                    productTile.innerHTML =
                        `
                         <div class="vvp-item-tile-content">
                             <img alt="" src="${elem.imageUrl}">
                             <div class="vvp-item-product-title-container">
                                 <a class="a-link-normal" target="_blank" rel="noopener" href="/dp/${elem.asin}" keepapreview="pf_prevImg">
                                     <span class="a-truncate" data-a-word-break="normal" data-a-max-rows="2" data-a-overflow-marker="&amp;hellip;" style="line-height: 1.3em !important; max-height: 2.6em;" data-a-recalculate="false" data-a-updated="true">
                                         <span class="a-truncate-full a-offscreen">${elem.description}</span>
                                         <span class="a-truncate-cut" aria-hidden="true" style="height: 2.6em;">${elem.description}</span>
                                     </span>
                                 </a>
                             </div>
                             <span class="a-button a-button-primary vvp-details-btn" id="a-autoid-0">
                                 <span class="a-button-inner"><input data-asin="${elem.asin}" data-is-parent-asin="${elem.isParentAsin}" data-recommendation-id="${elem.id}" data-recommendation-type="VINE_FOR_ALL" class="a-button-input" type="submit" aria-labelledby="a-autoid-0-announce">
                                     <span class="a-button-text" aria-hidden="true" id="a-autoid-0-announce">Weitere Details</span>
                                 </span>
                             </span>
                         </div>
                     `;
                    itemGrid.appendChild(productTile);
                });
                addFavStar();
            }else{
                itemGrid.innerHTML = 'Es sind keine Favoriten vorhanden.';
            }

        });

        addFavStar();

        function addFavStar(){
            const vvpItems = document.getElementById('vvp-items-grid').querySelectorAll('.vvp-item-tile');
            vvpItems.forEach(element => {
                const asin = element.querySelector('input[data-asin]').getAttribute('data-asin');
                const fav = document.createElement('div');
                fav.textContent = `★`;
                fav.style.display = 'flex';
                fav.style.float = 'right';
                fav.style.fontSize = '25px';
                fav.style.margin = '0';
                fav.style.height = '0';
                fav.style.cursor = 'pointer';
                fav.style.textShadow = 'black -1px 0px, black 0px 1px, black 1px 0px, black 0px -1px';
                fav.style.color = 'white';
                favorites.forEach((elem) => {
                    if(asin === elem.asin){
                        fav.style.color = '#ffd814';
                        //element.style.backgroundColor = '#ffd814';
                    }
                });
                element.insertBefore(fav, element.firstChild);
                let elements = [];
                fav.addEventListener('click', () => {
                    if(debug){console.log('[VF]',`Fav Star Clicked`)}
                    elements.push(element);
                    const articelInfos = extractArticleInfos(elements)
                    elements = [];
                    articelInfos.forEach((elem) => {
                        if(!favorites.some(item => item.id === elem.id)){
                            if(debug){'[VF]',console.log(elem)};
                            favorites.push(elem);
                            fav.style.color = '#ffd814';
                        }else{
                            favorites = favorites.filter(item => item.id !== elem.id);
                            if(debug){'[VF]',console.log('Fav entfernen')};
                            fav.style.color = 'white';
                        }
                    })
                    if(debug){'[VF]',console.log(favorites)};
                    localStorage.setItem('vf-favorites', JSON.stringify(favorites));
                })

            });
        }

    }

    function addShareSystem(){

        addShareIcon();

        function addShareIcon(){
            const vvpItems = document.getElementById('vvp-items-grid').querySelectorAll('.vvp-item-tile');
            vvpItems.forEach(element => {
                //const asin = element.querySelector('input[data-asin]').getAttribute('data-asin');
                const share = document.createElement('div');
                share.textContent = `🔗`;
                share.style.display = 'flex';
                share.style.float = 'left';
                share.style.fontSize = '15px';
                share.style.margin = '0';
                share.style.height = '0';
                share.style.cursor = 'pointer';
                //share.style.textShadow = 'black -1px 0px, black 0px 1px, black 1px 0px, black 0px -1px';
                element.insertBefore(share, element.firstChild);
                let elements = [];
                share.addEventListener('click', () => {

                    if(debug){console.log('[VF]',`Share Icon Clicked`)}
                    elements.push(element);
                    const articelInfos = extractArticleInfos(elements)
                    elements = [];
                    articelInfos.forEach((elem) => {
                        const newUrl = `${window.location.origin}/vine/vine-items?vine-data=${encodeURIComponent(JSON.stringify({
                            asin: elem.asin,
                            isParentAsin: elem.isParentAsin,
                            recommendationId: elem.id,
                            tax: elem.tax || '--.--'
                        }))}`;
                        const urlParams = new URLSearchParams(window.location.search);
                        let queueParam = urlParams.get('queue') || 'last_chance';
                        let pageParam = urlParams.get('page') || '1';
                        let page = "";
                        switch(queueParam){
                            case 'potluck':
                                queueParam = "Mein FSE"
                                page = `Seite: ${pageParam}`
                                break;
                            case 'last_chance':
                                queueParam = "Verfügbar für Alle"
                                page = `Seite: ${pageParam}`
                                break;
                            case 'encore':
                                queueParam = "Zusätzliche Artikel"
                                page = `Seite: ${pageParam}`
                                break;
                            default:
                                queueParam = ""
                                page = ``
                                break;
                        }
                        let shareText = `
${queueParam}
${page}
${elem.tax || '--.--€'}

${newUrl}`

                        const cursorPosition = event.target.selectionStart;
                        const inputRect = event.target.getBoundingClientRect();

                        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
                        const scrollY = window.pageYOffset || document.documentElement.scrollTop;

                        let sharePopup = document.createElement('div');
                        sharePopup.style.position = 'absolute';
                        sharePopup.style.zIndex = '9999';
                        sharePopup.style.padding = '5px'
                        sharePopup.style.top = `${inputRect.top + scrollY}px`;
                        sharePopup.style.left = `${inputRect.left + scrollX}px`;
                        sharePopup.style.border = '5px solid black';
                        sharePopup.style.borderRadius = '100vh';
                        sharePopup.style.backgroundColor = 'white'
                        sharePopup.style.transform = 'translate(-50%, -100%)'
                        sharePopup.style.opacity = '0';
                        sharePopup.style.transition = "opacity 0.2s ease-in-out";

                        navigator.clipboard.writeText(shareText).then(() => {
                            sharePopup.innerText = "Text wurde in die Zwischenablage kopiert."
                        }).catch(err => {
                            sharePopup.innerText = `Fehler beim Kopieren in die Zwischenablage: ${err}`
                        });

                        document.body.appendChild(sharePopup);

                        // Timeout 0ms for the next Event Cycle -> Give time to render
                        setTimeout(()=> {
                            sharePopup.style.opacity = '1';
                        }, 0);

                        setTimeout(()=> {
                            sharePopup.style.opacity = '0';
                            setTimeout(()=> {
                                sharePopup.remove();
                            }, 200);
                        }, 3500);

                    })

                })

            })
        }
    }




    function init() {
        startFetchingArticles();
        updateEncorePageInfo('Startet bald');
        injectSearchUI();
        duplicatePaginationElement();
        addFavSystem();
        addShareSystem();
        if(!window.location.href.includes('queue=potluck')){
            injectTaxInterception();
        }
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
                isParentAsin
            } = JSON.parse(decodeURIComponent(vineDataParam));

            const vineElementTmp = document.createElement('div');
            //vineElementTmp.style.display = 'none';
            vineElementTmp.innerHTML = `
                <span class="a-button a-button-primary vvp-details-btn" id="a-autoid-0">
                    <span class="a-button-inner">
                        <input data-asin="${asin}" data-is-parent-asin="${isParentAsin}" data-recommendation-id="${recommendationId}" data-recommendation-type="VENDOR_TARGETED" class="a-button-input" type="submit" aria-labelledby="a-autoid-0-announce">
                        <span class="a-button-text" aria-hidden="true" id="a-autoid-0-announce">Weitere Details</span>
                    </span>
                </span>
            `;
            document.body.appendChild(vineElementTmp);

            setTimeout(() => {
                vineElementTmp.querySelector('input').click();
                setTimeout(() => {
                    //vineElementTmp.remove();
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
