(() => {
    let currentVideoTitle = '';
    let currentVideoId = '';
    let currentCategory = '';

    let activeObservers = [];

    chrome.runtime.onMessage.addListener((obj, sender, response) => {
        waitForNavigateFinish(() => {
            activeObservers.forEach(x => x.disconnect())
            activeObservers = [];
            const channelIdLabels = document.querySelectorAll(`.channel-id-label`);
            channelIdLabels.forEach(label => label.remove());
            waitForTitleChange(async () => {
                getTitle();
                getChannelInfo();
                handleCommentUpdates();
            });
        });
    });

    function waitForNavigateFinish(callback) {
        window.addEventListener('yt-navigate-finish', () => {
            if (getVideoId() !== currentVideoId) {
                currentVideoId = getVideoId();

                callback();
            }
        });
    }

    function getVideoId() {
        const videoUrl = new URL(window.location.href);
        return videoUrl.searchParams.get('v');
    }

    function waitForTitleChange(callback) {
        const titleSelector = "h1.title.style-scope.ytd-video-primary-info-renderer";
        const titleElement = document.querySelector(titleSelector);
        let observing = false

        if (titleElement && titleElement.innerText !== currentVideoTitle) {
            currentVideoTitle = titleElement.innerText;
            callback();
        } else {
            const observer = new MutationObserver((mutations, observer) => {
                if (observing) {
                    return;
                }
                observing = true

                const titleElement = document.querySelector(titleSelector);
                if (titleElement && titleElement.innerText !== currentVideoTitle) {
                    currentVideoTitle = titleElement.innerText;
                    callback();
                    activeObservers = activeObservers.filter(observer => observer !== observer);
                    observing = false
                    observer.disconnect();
                    return;
                }

                observing = false
            });

            activeObservers.push(observer)
            observer.observe(document.body, {childList: true, subtree: true});
        }
    }

    function clearOldLabels() {
        const channelIdLabels = document.querySelectorAll(`.channel-id-label:not(._${currentVideoId})`);
        console.log('Clearing old labels, found:', channelIdLabels.length);
        channelIdLabels.forEach(label => label.remove());
    }


    function getTitle() {
        const titleElement = document.querySelector("h1.title.style-scope.ytd-video-primary-info-renderer");
        if (titleElement) {
            console.log('Video Title:', titleElement.innerText);
        }
    }

    async function predict_title(title) {
        const jsonReq = {"title": title};
        let response = await fetch("https://nckuy3p.hopto.org:666/ai/title/predict", {
            method: "POST",
            headers: {
                'Accept': 'application/json',
                "Content-Type": "application/json",
            },
            body: JSON.stringify(jsonReq),
        })
        const content = await response.json();
        return content["result"]
    }

    async function predict_comment(input) {
        const jsonReq = {"items": input};
        let response = await fetch("https://nckuy3p.hopto.org:666/ai/comments/predict", {
            method: "POST",
            headers: {
                'Accept': 'application/json',
                "Content-Type": "application/json",
            },
            body: JSON.stringify(jsonReq),
        })
        const content = await response.json();
        console.log(content["result"])
        return content["result"]
    }

    function getChannelInfo() {
        const channelElement = document.querySelector("ytd-video-owner-renderer.style-scope.ytd-watch-metadata a.yt-simple-endpoint.style-scope.yt-formatted-string");
        if (channelElement) {
            console.log('Channel URL:', channelElement.href);
            console.log('Channel Name:', channelElement.textContent);
        }
    }

    async function handleCommentUpdates() {
        const commentsContainerSelector = "ytd-comments.style-scope.ytd-watch-flexy";
        const commentsContainer = document.querySelector(commentsContainerSelector);
        let lastProcessedCommentIndex = 0;
        let timeout = null;
        let processingComments = false;
        let init = false
        let observing = false

        if (commentsContainer) {
            if (!observing) {
                const observer = new MutationObserver(async (mutations, observer) => {
                    if (processingComments || observing) {
                        return;
                    }
                    observing = true

                    if (!init) {
                        init = true
                        currentCategory = await predict_title(currentVideoTitle)
                        if (currentCategory !== "other") {
                            const titleElement = document.querySelector("yt-formatted-string.style-scope.ytd-watch-metadata");
                            const catElement = document.createElement('span');
                            catElement.innerText = `${currentCategory}`;
                            catElement.style.color = 'yellow';
                            catElement.style.backgroundColor = "black";
                            catElement.style.marginRight = '5px';
                            catElement.classList.add('channel-id-label');
                            catElement.classList.add(`_${currentVideoId}`);
                            titleElement.parentNode.append(catElement);
                        }
                    }

                    clearTimeout(timeout); // Clear any previous timeout

                    // Set a timeout to wait for comments to finish loading
                    timeout = setTimeout(async () => {
                        processingComments = true;
                        const contents = document.querySelectorAll("ytd-comment-thread-renderer");
                        const newCommentsCount = contents.length - lastProcessedCommentIndex;
                        if (newCommentsCount > 0) {
                            let {lastIndex, newComments} = getContents(lastProcessedCommentIndex);
                            lastProcessedCommentIndex = lastIndex;
                            clearOldLabels();
                            if (currentCategory === "other") {
                                activeObservers = activeObservers.filter(observer => observer !== observer);
                                observing = false
                                observer.disconnect();
                                return
                            }
                            console.log('New Loaded Comments:', newComments);
                            addToUserName(newComments)

                            // if (newComments.length < 20) {
                            //     activeObservers = activeObservers.filter(observer => observer !== observer);
                            //     observing = false
                            //     observer.disconnect();
                            //     return
                            // }
                        }
                        processingComments = false;
                    }, 500); // 500ms delay
                    observing = false
                });
                activeObservers.push(observer)
                observer.observe(commentsContainer, {childList: true, subtree: true});

            }
        }
    }


    function getContents(lastProcessedCommentIndex) {
        const contents = document.querySelectorAll("ytd-comment-thread-renderer");
        const newComments = [];

        for (let i = lastProcessedCommentIndex; i < contents.length; i++) {
            const commentTextElement = contents[i].querySelector("#content-text");
            const userNameElement = contents[i].querySelector("#author-text");

            if (commentTextElement && userNameElement) {
                const commentText = commentTextElement.innerText;
                newComments.push({
                    commentText: commentText,
                    userNameElement: userNameElement,
                });
            }
        }

        return {
            lastIndex: contents.length,
            newComments: newComments,
        };
    }

    async function addToUserName(newComments) {
        let onlyComments = newComments.map((x) => {
            return {"sts1": currentCategory, "sts2": x.commentText}
        })

        let result = await predict_comment(onlyComments)

        for (let i = 0; i < newComments.length; i++) {
            let userNameElement = newComments[i].userNameElement

            // Extract channel ID from href attribute
            const channelId = userNameElement.href.split('/channel/')[1];
            const stance = result[i];

            // Add channel ID next to the author name
            const idElement = document.createElement('span');
            if (stance === "agreed") {
                idElement.innerText = ` - Agree`;
                idElement.style.color = 'green';
            } else if (stance === "disagreed") {
                idElement.innerText = ` - Disagree`;
                idElement.style.color = 'red';
            } else {
                continue
            }
            idElement.style.marginRight = '5px';
            idElement.classList.add('channel-id-label');
            idElement.classList.add(`_${currentVideoId}`);
            userNameElement.append(idElement);
        }


    }

})();
