// utils/video-control.js - YouTube video control utility

class VideoController {
  constructor() {
    this.video = null;
    this.player = null;
    this.isYTPlayerReady = false;

    this.init();
  }

  init() {
    this.findVideo();
    this.setupYouTubePlayer();
  }

  findVideo() {
    // Find the video element
    this.video = document.querySelector('video');

    if (this.video) {
      console.log('Video element found');

      // Monitor for video changes
      const observer = new MutationObserver(() => {
        const newVideo = document.querySelector('video');
        if (newVideo && newVideo !== this.video) {
          this.video = newVideo;
          console.log('New video detected');
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } else {
      // Retry finding video
      setTimeout(() => this.findVideo(), 1000);
    }
  }

  setupYouTubePlayer() {
    // Try to access YouTube's player API if available
    try {
      if (window.ytInitialPlayerResponse && window.yt) {
        this.setupYTPlayerAPI();
      }
    } catch (error) {
      console.log('YouTube API not available, using HTML5 video controls');
    }
  }

  setupYTPlayerAPI() {
    // This would set up YouTube's iframe API if available
    // For now, we'll use direct video element control
    console.log('Setting up YouTube Player API integration');
  }

  pauseVideo() {
    try {
      if (this.video && !this.video.paused) {
        this.video.pause();
        console.log('Video paused via VideoController');
        return true;
      }
    } catch (error) {
      console.error('Error pausing video:', error);
    }
    return false;
  }

  resumeVideo() {
    try {
      if (this.video && this.video.paused) {
        // Create a promise to handle potential play failures
        const playPromise = this.video.play();

        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('Video resumed via VideoController');
          }).catch(error => {
            console.error('Error resuming video:', error);
            // Handle autoplay restrictions
            this.showPlayButton();
          });
        }
        return true;
      }
    } catch (error) {
      console.error('Error resuming video:', error);
    }
    return false;
  }

  showPlayButton() {
    // Show a custom play button if autoplay is blocked
    const playBtn = document.createElement('div');
    playBtn.id = 'pomodoro-play-btn';
    playBtn.innerHTML = `
      <div class="play-button-overlay">
        <button class="play-btn">▶ Click to Resume</button>
      </div>
    `;

    playBtn.addEventListener('click', () => {
      this.video.play();
      playBtn.remove();
    });

    document.body.appendChild(playBtn);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (document.getElementById('pomodoro-play-btn')) {
        playBtn.remove();
      }
    }, 10000);
  }

  getCurrentTime() {
    return this.video ? this.video.currentTime : 0;
  }

  getDuration() {
    return this.video ? this.video.duration : 0;
  }

  setCurrentTime(time) {
    if (this.video) {
      this.video.currentTime = time;
    }
  }

  isPlaying() {
    return this.video ? !this.video.paused : false;
  }

  getVolume() {
    return this.video ? this.video.volume : 0;
  }

  setVolume(volume) {
    if (this.video) {
      this.video.volume = Math.max(0, Math.min(1, volume));
    }
  }

  mute() {
    if (this.video) {
      this.video.muted = true;
    }
  }

  unmute() {
    if (this.video) {
      this.video.muted = false;
    }
  }

  isMuted() {
    return this.video ? this.video.muted : false;
  }

  // YouTube-specific controls (if YouTube API is available)
  getYouTubePlayer() {
    try {
      // Try to get YouTube player instance
      const playerElement = document.querySelector('#movie_player');
      if (playerElement && playerElement.getPlayerState) {
        return playerElement;
      }
    } catch (error) {
      console.log('YouTube player API not accessible');
    }
    return null;
  }

  getPlaybackRate() {
    try {
      const ytPlayer = this.getYouTubePlayer();
      if (ytPlayer && ytPlayer.getPlaybackRate) {
        return ytPlayer.getPlaybackRate();
      }
      return this.video ? this.video.playbackRate : 1;
    } catch (error) {
      return this.video ? this.video.playbackRate : 1;
    }
  }

  setPlaybackRate(rate) {
    try {
      const ytPlayer = this.getYouTubePlayer();
      if (ytPlayer && ytPlayer.setPlaybackRate) {
        ytPlayer.setPlaybackRate(rate);
        return;
      }

      if (this.video) {
        this.video.playbackRate = rate;
      }
    } catch (error) {
      console.error('Error setting playback rate:', error);
    }
  }

  // Quality control (YouTube specific)
  getAvailableQualityLevels() {
    try {
      const ytPlayer = this.getYouTubePlayer();
      if (ytPlayer && ytPlayer.getAvailableQualityLevels) {
        return ytPlayer.getAvailableQualityLevels();
      }
    } catch (error) {
      console.log('Quality levels not accessible');
    }
    return [];
  }

  setPlaybackQuality(quality) {
    try {
      const ytPlayer = this.getYouTubePlayer();
      if (ytPlayer && ytPlayer.setPlaybackQuality) {
        ytPlayer.setPlaybackQuality(quality);
      }
    } catch (error) {
      console.error('Error setting playback quality:', error);
    }
  }
}