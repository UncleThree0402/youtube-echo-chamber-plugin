chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
        const queryParameters = tab.url.split('?')[1];
        const urlParameters = new URLSearchParams(queryParameters);

        console.log(tab.url);

        chrome.tabs.sendMessage(tabId, {
            videoId: urlParameters.get('v'),
        });
    }
});