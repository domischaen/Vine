// ==UserScript==
// @name         Vinefuckers
// @namespace    http://tampermonkey.net/
// @version      2.0.1
// @description  Lädt das aktuelle Vine Fuckers Script extern. Um Diebe abzuhalten. :)
// @author       Domi
// @match        https://www.amazon.de/vine/vine-items*
// @grant        GM_xmlhttpRequest
// @connect      vinefuckers.de
// ==/UserScript==

(function() {
    'use strict';
    const vfToken = localStorage.getItem('vf-token');
    const scriptUrl = 'https://vinefuckers.de/update?token=' + vfToken;
	function checkTokenAndPrompt() {
		if (!vfToken) {
			const tokenInput = prompt('Bitte geben Sie den Token ein:');
			if (tokenInput) {
				localStorage.setItem('vf-token', tokenInput);
				alert('Token erfolgreich gespeichert!');
			} else {
				alert('Kein Token eingegeben. Funktion wird nicht aktiviert.');
			}
		}
	}

    GM_xmlhttpRequest({
        method: 'GET',
        url: scriptUrl,
        onload: function(response) {
            if (response.status === 200) {
                const script = document.createElement('script');
                script.textContent = response.responseText;
                document.body.appendChild(script);
            } else {
                console.error('Fehler beim Laden des externen Scripts:', response.statusText);
            }
        }
    });
})();
