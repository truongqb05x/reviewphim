// Load YouTube IFrame API
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

    // YouTube IFrame API will call this when it's ready
    window.onYouTubeIframeAPIReady = function() {
        youtubeApiReady = true;
        if (document.querySelectorAll('.youtube-video').length > 0) {
            initializePlayers();
        }
    };

    // Function to extract YouTube video ID from URL
    function getYouTubeVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    // Function to initialize YouTube players
    function initializePlayers() {
        const iframes = document.querySelectorAll('.youtube-video');
        players = [];
        playersReady = 0;

        iframes.forEach((iframe, index) => {
            const playerId = iframe.id;
            if (window.YT && window.YT.Player) {
                players[index] = new YT.Player(playerId, {
                    playerVars: {
                        enablejsapi: 1,
                        autoplay: 0,
                        controls: 0,
                        rel: 0,
                        modestbranding: 1,
                        loop: 1,
                        playlist: iframe.getAttribute('data-video-id')
                    },
                    events: {
                        'onReady': (event) => onPlayerReady(event, index),
                        'onStateChange': (event) => onPlayerStateChange(event, index)
                    }
                });
            } else {
                console.error('YouTube Player API not loaded');
            }
        });
    }

    // Function to start the fade-out timer for video info
    function startFadeTimer(index) {
        if (fadeTimeout) clearTimeout(fadeTimeout);
        const videoInfo = document.querySelector(`.video-container[data-video-index="${index}"] .video-info`);
        if (videoInfo) {
            fadeTimeout = setTimeout(() => {
                videoInfo.classList.add('hidden');
            }, 10000);
        }
    }

    // Function to track video view progress
    async function trackView(index) {
        if (!players[index] || !viewTracking[index]) return;

        const videoContainer = document.querySelector(`.video-container[data-video-index="${index}"]`);
        const videoId = parseInt(videoContainer.querySelector('.video-meta span').textContent.replace('@', ''));
        const duration = players[index].getDuration();
        const watchDuration = Math.floor(viewTracking[index].watch_duration);
        const isCompleted = watchDuration >= duration * 0.9; // Consider completed if watched 90%

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

        // Reset tracking for this video
        viewTracking[index] = null;
    }

    // Function to fetch videos from API and render them
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
                    <iframe
                        id="player-${index}"
                        class="youtube-video"
                        data-video-id="${videoId}"
                        src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&loop=1&origin=${location.origin}"
                        allow="autoplay; encrypted-media"
                        allowfullscreen>
                    </iframe>
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

                // Add mousemove event listener to show video info
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
            // Start tracking view
            viewTracking[index] = {
                start_time: Date.now(),
                watch_duration: 0
            };
            // Update watch duration every second
            viewTracking[index].interval = setInterval(() => {
                if (viewTracking[index]) {
                    viewTracking[index].watch_duration = (Date.now() - viewTracking[index].start_time) / 1000;
                }
            }, 1000);
        } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
            playButton.classList.remove('hidden');
            if (fadeTimeout) clearTimeout(fadeTimeout);
            videoInfo.classList.remove('hidden');
            // Stop tracking and send view data
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

        // Track view for the current video before switching
        trackView(currentVideoIndex);

        players.forEach((player, i) => {
            if (player) {
                player.pauseVideo();
                const btn = document.querySelector(`.play-button[data-video-index="${i}"]`);
                const videoInfo = document.querySelector(`.video-container[data-video-index="${i}"] .video-info`);
                if (btn) btn.classList.remove('hidden');
                if (videoInfo) videoInfo.classList.remove('hidden');
            }
        });

        if (fadeTimeout) clearTimeout(fadeTimeout);

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

        setTimeout(() => {
            if (players[newIndex]) {
                players[newIndex].playVideo();
                const btn = document.querySelector(`.play-button[data-video-index="${newIndex}"]`);
                if (btn) btn.classList.add('hidden');
                startFadeTimer(newIndex);
            }
            currentVideoIndex = newIndex;
            isScrolling = false;
            videoContainers.forEach(c => c.style.transition = '');
            updateProgressBars();
            const upButton = document.querySelector('.up-button');
            const downButton = document.querySelector('.down-button');
            
            upButton.style.display = currentVideoIndex === 0 ? 'none' : 'flex';
            downButton.style.display = currentVideoIndex === players.length - 1 ? 'none' : 'flex';
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