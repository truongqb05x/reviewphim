let players = [];
let currentVideoIndex = 0;
let playersReady = 0;
let isScrolling = false;
let lastScrollTime = 0;
const SCROLL_COOLDOWN = 500;
let youtubeApiReady = false;
let progressInterval = null;
let touchStartY = 0;
let fadeTimeout = null;
let viewTracking = {};
let isPageLoaded = false;

window.onYouTubeIframeAPIReady = function() {
    youtubeApiReady = true;
    console.log('YouTube IFrame API loaded successfully');
    initializePlayers();
};

function getYouTubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

async function validateVideo(videoId) {
    try {
        const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        if (response.ok) {
            const data = await response.json();
            if (!data.error) {
                console.log(`Video ${videoId} is embeddable`);
                return true;
            } else {
                console.warn(`Video ${videoId} is not embeddable: ${data.error}`);
                return false;
            }
        } else {
            console.warn(`Video ${videoId} is not embeddable or restricted, status: ${response.status}`);
            return false;
        }
    } catch (e) {
        console.error(`Error validating video ${videoId}:`, e);
        return false;
    }
}

async function initializePlayer(index, iframe, videoId) {
    console.log(`Initializing player-${index} with video ID: ${videoId}`);
    if (players[index]) {
        try {
            console.log(`Destroying existing player-${index}`);
            players[index].destroy();
            players[index] = null;
        } catch (e) {
            console.error(`Error destroying player-${index}:`, e);
            players[index] = null;
        }
    }

    try {
        players[index] = new YT.Player(`player-${index}`, {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                enablejsapi: 1,
                autoplay: 0,
                controls: 0,
                rel: 0,
                modestbranding: 1,
                loop: 1,
                playlist: videoId,
                playsinline: 1,
                origin: window.location.origin,
                fs: 0
            },
            events: {
                'onReady': (event) => onPlayerReady(event, index),
                'onStateChange': (event) => onPlayerStateChange(event, index),
                'onError': (event) => onPlayerError(event, index)
            }
        });
        console.log(`Player-${index} initialized successfully`);
        return true;
    } catch (e) {
        console.error(`Error initializing YouTube player-${index}:`, e);
        if (iframe.parentElement) {
            iframe.parentElement.classList.remove('loading');
            console.log(`Falling back to manual iframe for player-${index}, videoId: ${videoId}`);
            iframe.parentElement.innerHTML = `
                <iframe class="youtube-video" src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&controls=0&rel=0&modestbranding=1&loop=1&playlist=${videoId}&playsinline=1" frameborder="0" allowfullscreen></iframe>
                <p class="error-message">Sử dụng chế độ dự phòng để phát video</p>
            `;
        }
        players[index] = null;
        return false;
    }
}

async function initializePlayers() {
    if (!window.YT || !window.YT.Player) {
        console.error('YouTube API not ready, retrying in 1s...');
        setTimeout(initializePlayers, 1000);
        return;
    }

    const iframes = document.querySelectorAll('.youtube-video');
    console.log(`Initializing ${iframes.length} players, currentVideoIndex: ${currentVideoIndex}, origin: ${window.location.origin}`);
    players = new Array(iframes.length).fill(null);
    playersReady = 0;

    const startIndex = Math.max(0, currentVideoIndex);
    const endIndex = Math.min(iframes.length - 1, currentVideoIndex + 1);

    iframes.forEach((iframe, index) => {
        if (!iframe) return;
        iframe.style.display = index >= startIndex && index <= endIndex ? 'block' : 'none';
        if (iframe.parentElement) {
            iframe.parentElement.classList.add('loading');
        }
    });

    for (let index = startIndex; index <= endIndex; index++) {
        const iframe = document.getElementById(`player-${index}`);
        if (!iframe) {
            console.warn(`No iframe found for player-${index}`);
            continue;
        }

        const videoId = iframe.getAttribute('data-video-id');
        if (!videoId) {
            console.warn(`Invalid video ID for player-${index}`);
            if (iframe.parentElement) {
                iframe.parentElement.classList.remove('loading');
                iframe.parentElement.innerHTML = '<p class="error-message">Video không hợp lệ.</p>';
            }
            continue;
        }

        console.log(`Validating video ID: ${videoId}`);
        const isValid = await validateVideo(videoId);
        if (!isValid) {
            console.warn(`Skipping player-${index} due to invalid or restricted video: ${videoId}`);
            if (iframe.parentElement) {
                iframe.parentElement.classList.remove('loading');
                iframe.parentElement.innerHTML = `<p class="error-message">Video này không khả dụng.</p>`;
            }
            continue;
        }

        await initializePlayer(index, iframe, videoId);
    }
}

function onPlayerError(event, index) {
    console.error(`YouTube Player Error at index ${index}:`, event.data);
    const errorMessages = {
        2: 'ID video không hợp lệ',
        5: 'Lỗi HTML5 player',
        100: 'Video không tìm thấy',
        101: 'Video không cho phép nhúng',
        150: 'Video bị hạn chế nhúng'
    };
    const errorMessage = errorMessages[event.data] || 'Lỗi không xác định';
    const videoContainer = document.querySelector(`.video-container[data-video-index="${index}"]`);
    if (videoContainer) {
        videoContainer.classList.remove('loading');
        const videoId = videoContainer.querySelector('.youtube-video')?.getAttribute('data-video-id');
        if (videoId) {
            console.log(`Falling back to manual iframe for player-${index}, videoId: ${videoId}`);
            videoContainer.innerHTML = `
                <iframe class="youtube-video" src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&controls=0&rel=0&modestbranding=1&loop=1&playlist=${videoId}&playsinline=1" frameborder="0" allowfullscreen></iframe>
                <p class="error-message">Sử dụng chế độ dự phòng để phát video: ${errorMessage}</p>
            `;
        } else {
            videoContainer.innerHTML = `<p class="error-message">Không thể tải video này: ${errorMessage}</p>`;
        }
    }
    players[index] = null;
    if (index === currentVideoIndex && document.querySelectorAll('.video-container').length > index + 1) {
        console.log(`Skipping to next video due to error at index ${index}`);
        switchToVideo(index + 1);
    }
}

function startFadeTimer(index) {
    if (fadeTimeout) clearTimeout(fadeTimeout);
    const videoInfo = document.querySelector(`.video-container[data-video-index="${index}"] .video-info`);
    if (videoInfo) {
        fadeTimeout = setTimeout(() => {
            videoInfo.classList.add('hidden');
        }, 10000);
    }
}

async function trackView(index) {
    if (!players[index] || !viewTracking[index]) return;

    const videoContainer = document.querySelector(`.video-container[data-video-index="${index}"]`);
    if (!videoContainer) return;

    const videoId = parseInt(videoContainer.querySelector('.video-meta span').textContent.replace('@', ''));
    const duration = players[index].getDuration();
    const watchDuration = Math.floor(viewTracking[index].watch_duration);
    const isCompleted = watchDuration >= duration * 0.9;

    try {
        const response = await fetch('/track-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: videoId,
                watch_duration: watchDuration,
                is_completed: isCompleted
            })
        });
        if (!response.ok) {
            console.error('Failed to track view for video ID:', videoId);
        }
    } catch (error) {
        console.error('Error tracking view for video ID:', videoId, error);
    }

    viewTracking[index] = null;
}

async function fetchAndRenderVideos() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const tag = urlParams.get('tag');
        const apiUrl = tag ? `/videos?tag=${encodeURIComponent(tag)}` : '/videos';
        console.log('Fetching videos from:', apiUrl);
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch videos');
        }
        const data = await response.json();
        console.log('Fetched videos:', data.videos);
        const videoFeed = document.getElementById('video-feed');
        videoFeed.innerHTML = '';

        for (const [index, video] of data.videos.entries()) {
            const videoId = getYouTubeVideoId(video.video_url);
            if (!videoId) {
                console.warn(`Invalid YouTube URL: ${video.video_url}`);
                continue;
            }

            console.log(`Rendering video ${index}: URL=${video.video_url}, ID=${videoId}, Title=${video.title}`);

            const videoContainer = document.createElement('div');
            videoContainer.className = 'video-container loading';
            videoContainer.setAttribute('data-video-index', index);
            if (index !== 0) {
                videoContainer.style.transform = 'translateY(100vh)';
            }

            videoContainer.innerHTML = `
                <div class="progress-container">
                    <div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>
                    <div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>
                    <div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>
                </div>
                <iframe id="player-${index}" class="youtube-video" data-video-id="${videoId}" frameborder="0" allowfullscreen></iframe>
                <div class="play-button hidden" data-video-index="${index}">
                    <i class="fas fa-play"></i>
                </div>
                <div class="video-info">
                    <div class="video-meta">
                        <span>@${video.video_id}</span>
                        <span style="margin: 0 5px">•</span>
                        <span><i class="fas fa-star" style="color: gold; margin-right: 3px;"></i>8.5/10</span>
                    </div>
                    <h3 class="video-title">${video.title}</h3>
                    <a href="${video.video_url}" target="_blank" class="video-link">Xem trên YouTube</a>
                    <p class="video-desc">${video.description}</p>
                    <div class="video-tags">
                        ${video.tags.map(tag => `<span class="tag">#${tag}</span>`).join('')}
                    </div>
                </div>
            `;
            videoFeed.appendChild(videoContainer);

            videoContainer.addEventListener('mousemove', () => {
                const videoInfo = videoContainer.querySelector('.video-info');
                if (videoInfo.classList.contains('hidden')) {
                    videoInfo.classList.remove('hidden');
                    if (players[index] && typeof players[index].getPlayerState === 'function' && players[index].getPlayerState() === YT.PlayerState.PLAYING) {
                        startFadeTimer(index);
                    }
                }
            });
        }

        if (!data.videos.length) {
            console.warn('No videos available to display');
            videoFeed.innerHTML = '<p class="error-message">Không có video nào để hiển thị.</p>';
            return;
        }

        document.querySelectorAll('.play-button').forEach(button => {
            const idx = parseInt(button.getAttribute('data-video-index'));
            button.addEventListener('click', () => handlePlayButtonClick(idx));
        });

        document.querySelector('.up-button').style.display = 'none';
        if (data.videos.length <= 1) {
            document.querySelector('.down-button').style.display = 'none';
        }

        if (youtubeApiReady) {
            console.log('YouTube API ready, initializing players');
            initializePlayers();
        }

        setTimeout(() => {
            isPageLoaded = true;
            console.log('Page fully loaded, enabling scroll events');
        }, 2000);
    } catch (error) {
        console.error('Error fetching videos:', error);
        document.getElementById('video-feed').innerHTML = '<p class="error-message">Error loading videos. Please try again later.</p>';
    }
}

function onPlayerReady(event, index) {
    if (!players[index]) {
        console.warn(`Player at index ${index} is null on ready event`);
        return;
    }

    playersReady++;
    console.log(`Player-${index} ready, total ready: ${playersReady}`);

    const iframe = document.getElementById(`player-${index}`);
    const playButton = document.querySelector(`.play-button[data-video-index="${index}"]`);
    const videoContainer = document.querySelector(`.video-container[data-video-index="${index}"]`);

    if (iframe) {
        iframe.classList.add('ready');
        iframe.style.display = 'block';
    }
    if (playButton) {
        playButton.classList.remove('hidden');
    }
    if (videoContainer) {
        videoContainer.classList.remove('loading');
    }

    if (index === currentVideoIndex && players[index] && typeof players[index].playVideo === 'function') {
        try {
            console.log(`Playing video at index ${index}`);
            players[index].playVideo();
            if (playButton) playButton.classList.add('hidden');
            startFadeTimer(index);
        } catch (e) {
            console.error(`Error playing video at index ${index}:`, e);
            if (videoContainer) {
                videoContainer.classList.remove('loading');
                videoContainer.innerHTML = `<p class="error-message">Không thể phát video này: ${e.message}</p>`;
            }
            players[index] = null;
            if (document.querySelectorAll('.video-container').length > index + 1) {
                console.log(`Skipping to next video due to play error at index ${index}`);
                switchToVideo(index + 1);
            }
        }
    }

    if (playersReady >= document.querySelectorAll('.youtube-video').length) {
        console.log('All players ready, starting progress updates');
        startProgressUpdates();
    }
}

function onPlayerStateChange(event, index) {
    if (!players[index]) {
        console.warn(`Player at index ${index} is null on state change`);
        return;
    }

    const playButton = document.querySelector(`.play-button[data-video-index="${index}"]`);
    const videoInfo = document.querySelector(`.video-container[data-video-index="${index}"] .video-info`);
    const videoContainer = document.querySelector(`.video-container[data-video-index="${index}"]`);

    if (!playButton || !videoInfo || !videoContainer) {
        console.warn(`Missing elements for player-${index}: playButton=${!!playButton}, videoInfo=${!!videoInfo}, videoContainer=${!!videoContainer}`);
        return;
    }

    videoContainer.classList.remove('loading');

    if (event.data === YT.PlayerState.PLAYING) {
        console.log(`Player-${index} state: PLAYING`);
        playButton.classList.add('hidden');
        startFadeTimer(index);
        viewTracking[index] = {
            start_time: Date.now(),
            watch_duration: 0
        };
        viewTracking[index].interval = setInterval(() => {
            if (viewTracking[index]) {
                viewTracking[index].watch_duration = (Date.now() - viewTracking[index].start_time) / 1000;
            }
        }, 1000);
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        console.log(`Player-${index} state: ${event.data === YT.PlayerState.PAUSED ? 'PAUSED' : 'ENDED'}`);
        playButton.classList.remove('hidden');
        if (fadeTimeout) clearTimeout(fadeTimeout);
        videoInfo.classList.remove('hidden');
        if (viewTracking[index]) {
            clearInterval(viewTracking[index].interval);
            trackView(index);
        }
    }

    if (event.data === YT.PlayerState.ENDED) {
        console.log(`Player-${index} ended, restarting video`);
        event.target.playVideo();
    }
}

function handlePlayButtonClick(index) {
    if (!players[index] || typeof players[index].getPlayerState !== 'function') {
        console.warn(`No valid player at index ${index} for play button click`);
        return;
    }

    const state = players[index].getPlayerState();
    const playButton = document.querySelector(`.play-button[data-video-index="${index}"]`);
    const videoContainer = document.querySelector(`.video-container[data-video-index="${index}"]`);

    if (!playButton || !videoContainer) {
        console.warn(`Missing elements for play button click at index ${index}`);
        return;
    }

    if (state === YT.PlayerState.PLAYING) {
        console.log(`Pausing player-${index}`);
        players[index].pauseVideo();
        playButton.classList.remove('hidden');
        videoContainer.classList.remove('loading');
    } else {
        console.log(`Playing player-${index}, pausing others`);
        players.forEach((player, i) => {
            if (i !== index && player && typeof player.getPlayerState === 'function' && player.getPlayerState() === YT.PlayerState.PLAYING) {
                console.log(`Pausing player-${i}`);
                player.pauseVideo();
                const otherBtn = document.querySelector(`.play-button[data-video-index="${i}"]`);
                if (otherBtn) otherBtn.classList.remove('hidden');
            }
        });

        try {
            players[index].playVideo();
            playButton.classList.add('hidden');
            videoContainer.classList.remove('loading');
            startFadeTimer(index);
            console.log(`Player-${index} started playing`);
        } catch (e) {
            console.error(`Error playing video at index ${index}:`, e);
            playButton.classList.remove('hidden');
            videoContainer.classList.remove('loading');
        }
    }
}

function updateProgressBars() {
    const fills = document.querySelectorAll('.progress-fill');
    fills.forEach((fill, i) => {
        if (i < currentVideoIndex) {
            fill.style.width = '0%';
        } else if (i === currentVideoIndex && players[currentVideoIndex] && typeof players[currentVideoIndex].getCurrentTime === 'function') {
            const duration = players[currentVideoIndex].getDuration();
            const currentTime = players[currentVideoIndex].getCurrentTime();
            const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
            fill.style.width = pct + '%';
        } else {
            fill.style.width = '0%';
        }
    });
}

function startProgressUpdates() {
    if (progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(updateProgressBars, 100);
}

function switchToVideo(newIndex) {
    if (isScrolling || newIndex === currentVideoIndex) {
        console.log(`Switch to video ${newIndex} aborted: isScrolling=${isScrolling}, currentVideoIndex=${currentVideoIndex}`);
        return;
    }

    const videoContainers = document.querySelectorAll('.video-container');
    if (newIndex < 0 || newIndex >= videoContainers.length) {
        console.log(`Invalid newIndex: ${newIndex}, total videos: ${videoContainers.length}`);
        return;
    }

    const now = Date.now();
    if (now - lastScrollTime < SCROLL_COOLDOWN) {
        console.log(`Switch to video ${newIndex} aborted: within cooldown period`);
        return;
    }

    isScrolling = true;
    lastScrollTime = now;
    console.log(`Switching to video index ${newIndex} from ${currentVideoIndex}`);

    trackView(currentVideoIndex);

    players.forEach((player, i) => {
        if (player && typeof player.getPlayerState === 'function') {
            try {
                console.log(`Pausing player-${i}`);
                player.pauseVideo();
                const btn = document.querySelector(`.play-button[data-video-index="${i}"]`);
                const videoInfo = document.querySelector(`.video-container[data-video-index="${i}"] .video-info`);
                const container = document.querySelector(`.video-container[data-video-index="${i}"]`);
                if (btn) btn.classList.remove('hidden');
                if (videoInfo) videoInfo.classList.remove('hidden');
                if (container) container.classList.remove('loading');
            } catch (e) {
                console.error(`Error pausing player-${i}:`, e);
                players[i] = null;
            }
        } else if (player) {
            console.warn(`Player-${i} exists but is not a valid YouTube Player instance`);
            players[i] = null;
        }
    });

    if (fadeTimeout) clearTimeout(fadeTimeout);

    videoContainers.forEach((container, i) => {
        if (!container) return;

        container.style.transition = 'transform 0.3s ease';
        if (i === newIndex) {
            container.style.transform = 'translateY(0)';
        } else if (i === currentVideoIndex) {
            const dir = newIndex > currentVideoIndex ? -1 : 1;
            container.style.transform = `translateY(${dir * 100}vh)`;
        } else {
            container.style.transform = 'translateY(100vh)';
        }
    });

    setTimeout(async () => {
        const startIndex = Math.max(0, newIndex);
        const endIndex = Math.min(videoContainers.length - 1, newIndex + 1);

        for (let i = startIndex; i <= endIndex; i++) {
            const iframe = document.getElementById(`player-${i}`);
            if (!iframe) {
                console.warn(`No iframe for player-${i}`);
                continue;
            }

            iframe.style.display = 'block';

            if (!players[i]) {
                const videoId = iframe.getAttribute('data-video-id');
                if (!videoId) {
                    console.warn(`Invalid video ID for player-${i}`);
                    if (iframe.parentElement) {
                        iframe.parentElement.classList.remove('loading');
                        iframe.parentElement.innerHTML = '<p class="error-message">Video không hợp lệ.</p>';
                    }
                    continue;
                }

                console.log(`Validating video ID: ${videoId} for player-${i}`);
                const isValid = await validateVideo(videoId);
                if (!isValid) {
                    console.warn(`Skipping player-${i} due to invalid or restricted video: ${videoId}`);
                    if (iframe.parentElement) {
                        iframe.parentElement.classList.remove('loading');
                        iframe.parentElement.innerHTML = `<p class="error-message">Video này không khả dụng.</p>`;
                    }
                    continue;
                }

                console.log(`Creating new player-${i} for video ID: ${videoId}`);
                await initializePlayer(i, iframe, videoId);
            } else if (i === newIndex) {
                try {
                    iframe.style.display = 'block';
                    iframe.classList.add('ready');
                    if (iframe.parentElement) {
                        iframe.parentElement.classList.remove('loading');
                    }
                    if (typeof players[i].playVideo === 'function') {
                        console.log(`Playing existing player-${i}`);
                        players[i].playVideo();
                        const btn = document.querySelector(`.play-button[data-video-index="${i}"]`);
                        if (btn) btn.classList.add('hidden');
                        startFadeTimer(i);
                    } else {
                        console.warn(`Player-${i} exists but playVideo is not a function`);
                        players[i] = null;
                        if (iframe.parentElement) {
                            iframe.parentElement.classList.remove('loading');
                            iframe.parentElement.innerHTML = `<p class="error-message">Không thể phát video này.</p>`;
                        }
                    }
                } catch (e) {
                    console.error(`Error playing video at index ${i}:`, e);
                    if (iframe.parentElement) {
                        iframe.parentElement.classList.remove('loading');
                        iframe.parentElement.innerHTML = `<p class="error-message">Không thể phát video này: ${e.message}</p>`;
                    }
                    players[i] = null;
                }
            }
        }

        for (let i = 0; i < videoContainers.length; i++) {
            if (i < startIndex || i > endIndex) {
                const iframe = document.getElementById(`player-${i}`);
                if (iframe) {
                    iframe.style.display = 'none';
                    if (iframe.parentElement) {
                        iframe.parentElement.classList.remove('loading');
                    }
                }
            }
        }

        currentVideoIndex = newIndex;
        isScrolling = false;

        videoContainers.forEach(c => {
            if (c) c.style.transition = '';
        });

        updateProgressBars();

        const upButton = document.querySelector('.up-button');
        const downButton = document.querySelector('.down-button');
        if (upButton) upButton.style.display = currentVideoIndex === 0 ? 'none' : 'flex';
        if (downButton) downButton.style.display = currentVideoIndex === videoContainers.length - 1 ? 'none' : 'flex';
        console.log(`Switched to video index ${newIndex}, players state:`, players.map(p => !!p));
    }, 300);
}

function handleScroll(e) {
    if (!isPageLoaded) {
        console.log('Ignoring scroll event: page not fully loaded');
        e.preventDefault();
        return;
    }

    e.preventDefault();

    const now = Date.now();
    if (now - lastScrollTime < SCROLL_COOLDOWN) {
        console.log('Ignoring scroll event: within cooldown');
        return;
    }

    let deltaY = 0;
    if (e.type === 'wheel') {
        deltaY = e.deltaY;
        console.log(`Wheel scroll detected, deltaY: ${deltaY}`);
    } else if (e.type === 'touchstart') {
        touchStartY = e.touches[0].clientY;
        console.log(`Touch start, touchStartY: ${touchStartY}`);
        return;
    } else if (e.type === 'touchmove') {
        deltaY = e.touches[0].clientY - touchStartY;
        console.log(`Touch move, deltaY: ${deltaY}`);
    } else if (e.type === 'touchend') {
        deltaY = e.changedTouches[0].clientY - touchStartY;
        console.log(`Touch end, deltaY: ${deltaY}`);
    }

    if (Math.abs(deltaY) < 50 && e.type.includes('touch')) {
        console.log('Ignoring touch scroll: deltaY too small');
        return;
    }

    if (deltaY > 0) {
        console.log('Scrolling down');
        switchToVideo(currentVideoIndex + 1);
    } else if (deltaY < 0) {
        console.log('Scrolling up');
        switchToVideo(Math.max(0, currentVideoIndex - 1));
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, fetching videos');
    fetchAndRenderVideos();
    document.querySelector('.up-button').addEventListener('click', () => {
        console.log('Up button clicked');
        switchToVideo(Math.max(0, currentVideoIndex - 1));
    });

    document.querySelector('.down-button').addEventListener('click', () => {
        console.log('Down button clicked');
        switchToVideo(currentVideoIndex + 1);
    });

    window.addEventListener('wheel', handleScroll, { passive: false });
    window.addEventListener('touchstart', handleScroll, { passive: false });
    window.addEventListener('touchmove', handleScroll, { passive: false });
    window.addEventListener('touchend', handleScroll, { passive: false });

    window.addEventListener('keydown', (e) => {
        if (!isPageLoaded) {
            console.log(`Ignoring keydown event (${e.key}): page not fully loaded`);
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowDown') {
            console.log('ArrowDown pressed');
            switchToVideo(currentVideoIndex + 1);
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            console.log('ArrowUp pressed');
            switchToVideo(Math.max(0, currentVideoIndex - 1));
            e.preventDefault();
        }
    });
});