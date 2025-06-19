var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

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

window.onYouTubeIframeAPIReady = function() {
    youtubeApiReady = true;
    initializePlayers();
};

function getYouTubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function initializePlayers() {
    const iframes = document.querySelectorAll('.youtube-video');
    players = new Array(iframes.length).fill(null);
    playersReady = 0;

    // Chỉ khởi tạo player cho video hiện tại và các video lân cận
    const startIndex = Math.max(0, currentVideoIndex - 1);
    const endIndex = Math.min(iframes.length - 1, currentVideoIndex + 1);

    for (let index = startIndex; index <= endIndex; index++) {
        const iframe = iframes[index];
        const playerId = iframe.id;
        
        // Reset và chuẩn bị iframe trước khi khởi tạo player
        iframe.style.display = 'block';
        iframe.style.visibility = 'visible';
        iframe.style.opacity = '0'; // Bắt đầu với opacity = 0
        iframe.style.transition = 'opacity 0.5s ease'; // Hiệu ứng fade
        
        // Xóa player cũ nếu tồn tại
        if (players[index]) {
            try {
                players[index].destroy();
            } catch (e) {
                console.error('Error destroying player:', e);
            }
            players[index] = null;
        }
        
        if (window.YT && window.YT.Player) {
            const origin = window.location.protocol + '//' + window.location.host;
            try {
                players[index] = new YT.Player(playerId, {
                    height: '100%',
                    width: '100%',
                    videoId: iframe.getAttribute('data-video-id'),
                    playerVars: {
                        enablejsapi: 1,
                        autoplay: index === currentVideoIndex ? 1 : 0,
                        controls: 0,
                        rel: 0,
                        modestbranding: 1,
                        loop: 1,
                        playlist: iframe.getAttribute('data-video-id'),
                        playsinline: 1,
                        origin: origin,
                        fs: 0
                    },
                    events: {
                        'onReady': (event) => {
                            // Khi player ready, fade in video
                            iframe.style.opacity = '1';
                            onPlayerReady(event, index);
                        },
                        'onStateChange': (event) => onPlayerStateChange(event, index),
                        'onError': (event) => {
                            // Xử lý lỗi và vẫn hiển thị video
                            iframe.style.opacity = '1';
                            onPlayerError(event, index);
                        }
                    }
                });
            } catch (e) {
                console.error('Error initializing YouTube player:', e);
                // Nếu có lỗi, vẫn hiển thị iframe
                iframe.style.opacity = '1';
            }
        } else {
            // Nếu YT API chưa sẵn sàng, vẫn hiển thị iframe
            iframe.style.opacity = '1';
        }
    }

    // Ẩn các iframe không cần thiết
    for (let i = 0; i < iframes.length; i++) {
        if (i < startIndex || i > endIndex) {
            iframes[i].style.display = 'none';
            iframes[i].style.opacity = '0';
        }
    }
}
function onPlayerError(event, index) {
    console.error(`YouTube Player Error at index ${index}:`, event.data);
    const videoContainer = document.querySelector(`.video-container[data-video-index="${index}"]`);
    if (videoContainer) {
        videoContainer.innerHTML = '<p>Không thể tải video này. Vui lòng thử lại.</p>';
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
            console.error('Failed to track view');
        }
    } catch (error) {
        console.error('Error tracking view:', error);
    }

    viewTracking[index] = null;
}

async function fetchAndRenderVideos() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const tag = urlParams.get('tag');
        const apiUrl = tag ? `/videos?tag=${encodeURIComponent(tag)}` : '/videos';
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch videos');
        }
        const data = await response.json();
        const videoFeed = document.getElementById('video-feed');
        videoFeed.innerHTML = '';

        data.videos.forEach((video, index) => {
            const videoId = getYouTubeVideoId(video.video_url);
            if (!videoId) return;

            const videoContainer = document.createElement('div');
            videoContainer.className = 'video-container';
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
                <div id="player-${index}" class="youtube-video" data-video-id="${videoId}"></div>
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
                    if (players[index] && players[index].getPlayerState() === YT.PlayerState.PLAYING) {
                        startFadeTimer(index);
                    }
                }
            });
        });

        document.querySelectorAll('.play-button').forEach(button => {
            const idx = parseInt(button.getAttribute('data-video-index'));
            button.addEventListener('click', () => handlePlayButtonClick(idx));
        });

        if (youtubeApiReady) {
            initializePlayers();
            document.querySelector('.up-button').style.display = 'none';
            if (data.videos.length <= 1) {
                document.querySelector('.down-button').style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error fetching videos:', error);
        document.getElementById('video-feed').innerHTML = '<p>Error loading videos. Please try again later.</p>';
    }
}

function onPlayerReady(event, index) {
    playersReady++;
    const playButton = document.querySelector(`.play-button[data-video-index="${index}"]`);
    if (playButton) playButton.classList.remove('hidden');

    if (index === 0 && players[0]) {
        setTimeout(() => {
            players[0].playVideo();
            playButton.classList.add('hidden');
            startFadeTimer(0);
        }, 500);
    }

    if (playersReady === document.querySelectorAll('.youtube-video').length) {
        startProgressUpdates();
    }
}

function onPlayerStateChange(event, index) {
    const playButton = document.querySelector(`.play-button[data-video-index="${index}"]`);
    const videoInfo = document.querySelector(`.video-container[data-video-index="${index}"] .video-info`);
    if (!playButton || !videoInfo) return;

    if (event.data === YT.PlayerState.PLAYING) {
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
        playButton.classList.remove('hidden');
        if (fadeTimeout) clearTimeout(fadeTimeout);
        videoInfo.classList.remove('hidden');
        if (viewTracking[index]) {
            clearInterval(viewTracking[index].interval);
            trackView(index);
        }
    }

    if (event.data === YT.PlayerState.ENDED) {
        event.target.playVideo();
    }
}

function handlePlayButtonClick(index) {
    if (!players[index]) return;
    const state = players[index].getPlayerState();
    const playButton = document.querySelector(`.play-button[data-video-index="${index}"]`);

    if (state === YT.PlayerState.PLAYING) {
        players[index].pauseVideo();
        playButton.classList.remove('hidden');
    } else {
        players.forEach((player, i) => {
            if (i !== index && player && player.getPlayerState() === YT.PlayerState.PLAYING) {
                player.pauseVideo();
                const otherBtn = document.querySelector(`.play-button[data-video-index="${i}"]`);
                if (otherBtn) otherBtn.classList.remove('hidden');
            }
        });
        players[index].playVideo();
        playButton.classList.add('hidden');
        startFadeTimer(index);
    }
}

function updateProgressBars() {
    const fills = document.querySelectorAll('.progress-fill');
    fills.forEach((fill, i) => {
        if (i < currentVideoIndex) {
            fill.style.width = '100%';
        } else if (i === currentVideoIndex && players[currentVideoIndex]) {
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
    if (isScrolling || newIndex === currentVideoIndex) return;

    const videoContainers = document.querySelectorAll('.video-container');
    if (newIndex < 0 || newIndex >= videoContainers.length) return;

    const now = Date.now();
    if (now - lastScrollTime < SCROLL_COOLDOWN) return;

    isScrolling = true;
    lastScrollTime = now;

    // Dừng theo dõi video hiện tại
    trackView(currentVideoIndex);

    // Dừng tất cả player hiện tại
    players.forEach((player, i) => {
        if (player) {
            try {
                player.pauseVideo();
                const btn = document.querySelector(`.play-button[data-video-index="${i}"]`);
                const videoInfo = document.querySelector(`.video-container[data-video-index="${i}"] .video-info`);
                if (btn) btn.classList.remove('hidden');
                if (videoInfo) videoInfo.classList.remove('hidden');
            } catch (e) {
                console.error('Error pausing player:', e);
            }
        }
    });

    if (fadeTimeout) clearTimeout(fadeTimeout);

    // Ẩn tất cả iframe trước khi chuyển
    document.querySelectorAll('.youtube-video').forEach(iframe => {
        iframe.style.display = 'none';
    });

    // Hiển thị iframe của video mới
    const newIframe = document.querySelector(`#player-${newIndex}`);
    if (newIframe) {
        newIframe.style.display = 'block';
        newIframe.style.visibility = 'visible';
    }

    // Áp dụng hiệu ứng chuyển đổi
    videoContainers.forEach((container, i) => {
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

    // Hủy player ngoài phạm vi
    players.forEach((player, i) => {
        if (player && Math.abs(i - newIndex) > 1) {
            try {
                player.destroy();
                players[i] = null;
            } catch (e) {
                console.error('Error destroying player:', e);
            }
        }
    });

    setTimeout(() => {
        // Khởi tạo player mới nếu cần
        const startIndex = Math.max(0, newIndex - 1);
        const endIndex = Math.min(videoContainers.length - 1, newIndex + 1);
        
        for (let i = startIndex; i <= endIndex; i++) {
            if (!players[i]) {
                const iframe = document.querySelector(`#player-${i}`);
                if (iframe) {
                    iframe.style.display = 'block';
                    iframe.style.visibility = 'visible';
                    
                    const videoId = iframe.getAttribute('data-video-id');
                    players[i] = new YT.Player(`player-${i}`, {
                        height: '100%',
                        width: '100%',
                        videoId: videoId,
                        playerVars: {
                            enablejsapi: 1,
                            autoplay: i === newIndex ? 1 : 0,
                            controls: 0,
                            rel: 0,
                            modestbranding: 1,
                            loop: 1,
                            playlist: videoId,
                            playsinline: 1,
                            origin: window.location.origin
                        },
                        events: {
                            'onReady': (event) => {
                                if (i === newIndex) {
                                    event.target.playVideo();
                                    const btn = document.querySelector(`.play-button[data-video-index="${i}"]`);
                                    if (btn) btn.classList.add('hidden');
                                    startFadeTimer(i);
                                }
                                onPlayerReady(event, i);
                            },
                            'onStateChange': (event) => onPlayerStateChange(event, i),
                            'onError': (event) => onPlayerError(event, i)
                        }
                    });
                }
            } else if (i === newIndex) {
                try {
                    // Đảm bảo iframe hiển thị trước khi play
                    const iframe = document.querySelector(`#player-${i}`);
                    if (iframe) {
                        iframe.style.display = 'block';
                        iframe.style.visibility = 'visible';
                    }
                    
                    players[i].playVideo();
                    const btn = document.querySelector(`.play-button[data-video-index="${i}"]`);
                    if (btn) btn.classList.add('hidden');
                    startFadeTimer(i);
                } catch (e) {
                    console.error('Error playing video:', e);
                    // Thử khởi tạo lại player nếu có lỗi
                    players[i] = null;
                    const iframe = document.querySelector(`#player-${i}`);
                    if (iframe) {
                        const videoId = iframe.getAttribute('data-video-id');
                        players[i] = new YT.Player(`player-${i}`, {
                            height: '100%',
                            width: '100%',
                            videoId: videoId,
                            playerVars: {
                                enablejsapi: 1,
                                autoplay: 1,
                                controls: 0,
                                rel: 0,
                                modestbranding: 1,
                                loop: 1,
                                playlist: videoId,
                                playsinline: 1,
                                origin: window.location.origin
                            },
                            events: {
                                'onReady': (event) => {
                                    event.target.playVideo();
                                    const btn = document.querySelector(`.play-button[data-video-index="${i}"]`);
                                    if (btn) btn.classList.add('hidden');
                                    startFadeTimer(i);
                                },
                                'onStateChange': (event) => onPlayerStateChange(event, i),
                                'onError': (event) => onPlayerError(event, i)
                            }
                        });
                    }
                }
            }
        }

        currentVideoIndex = newIndex;
        isScrolling = false;
        videoContainers.forEach(c => c.style.transition = '');
        updateProgressBars();

        const upButton = document.querySelector('.up-button');
        const downButton = document.querySelector('.down-button');
        upButton.style.display = currentVideoIndex === 0 ? 'none' : 'flex';
        downButton.style.display = currentVideoIndex === videoContainers.length - 1 ? 'none' : 'flex';
    }, 300);
}
function handleScroll(e) {
    e.preventDefault();

    const now = Date.now();
    if (now - lastScrollTime < SCROLL_COOLDOWN) return;

    let deltaY = 0;
    if (e.type === 'wheel') {
        deltaY = e.deltaY;
    } else if (e.type === 'touchstart') {
        touchStartY = e.touches[0].clientY;
        return;
    } else if (e.type === 'touchmove') {
        deltaY = e.touches[0].clientY - touchStartY;
    } else if (e.type === 'touchend') {
        deltaY = e.changedTouches[0].clientY - touchStartY;
    }

    if (Math.abs(deltaY) < 50 && e.type.includes('touch')) return;

    if (deltaY > 0) {
        switchToVideo(currentVideoIndex + 1);
    } else if (deltaY < 0) {
        switchToVideo(currentVideoIndex - 1);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    fetchAndRenderVideos();
    document.querySelector('.up-button').addEventListener('click', () => {
        switchToVideo(currentVideoIndex - 1);
    });

    document.querySelector('.down-button').addEventListener('click', () => {
        switchToVideo(currentVideoIndex + 1);
    });

    window.addEventListener('wheel', handleScroll, { passive: false });
    window.addEventListener('touchstart', handleScroll, { passive: false });
    window.addEventListener('touchmove', handleScroll, { passive: false });
    window.addEventListener('touchend', handleScroll, { passive: false });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            switchToVideo(currentVideoIndex + 1);
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            switchToVideo(currentVideoIndex - 1);
            e.preventDefault();
        }
    });
});
