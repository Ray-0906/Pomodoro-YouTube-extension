// content.js - FINAL FIX for pause/resume issue

class YouTubePomodoroTimer {
  constructor() {
    this.video = null;
    this.isLecture = false;
    this.timerState = null;
    this.overlay = null;
    this.lectureDetector = null;
    this.videoController = null;
    this.isInitialized = false;
    this.hasShownNotification = false;
    this.autoStartEnabled = true;
    this.isTimerControlledPause = false;
    this.hasStartedInitialTimer = false; // NEW: Track if we've started the first timer

    console.log('🍅 YouTubePomodoroTimer: Final fix version starting...');
    this.init();
  }

  async init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      await this.setup();
    }
  }

  async setup() {
    try {
      console.log('🍅 Setting up with improved logic...');

      this.lectureDetector = new LectureDetector();
      this.videoController = new VideoController();

      await this.waitForVideo();

      // Get current timer state from background
      await this.syncTimerState();

      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
      });

      this.setupNavigationListener();

      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.detectLectureContent();

      this.isInitialized = true;
      console.log('✅ YouTube Pomodoro Timer initialized with improved pause/resume logic');

    } catch (error) {
      console.error('❌ Error setting up:', error);
    }
  }

  // NEW: Sync timer state from background
  async syncTimerState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' });
      this.timerState = response;

      if (this.timerState?.isActive) {
        console.log('📊 Synced active timer state:', this.timerState);
        this.showOverlay(this.timerState.mode);

        if (this.timerState.mode === 'work') {
          this.hasStartedInitialTimer = true; // Mark as already started
        }
      }
    } catch (error) {
      console.error('❌ Error syncing timer state:', error);
    }
  }

  async waitForVideo() {
    console.log('🎥 Waiting for video element...');

    return new Promise((resolve) => {
      const checkForVideo = () => {
        this.video = document.querySelector('video');

        if (this.video) {
          console.log('✅ Video element found');

          // FIXED: Improved video event handling
          this.video.addEventListener('play', async (e) => {
            console.log('▶️ Video play event detected');

            // Sync state first to get latest info
            await this.syncTimerState();

            // CRITICAL FIX: Only start timer if no timer is active AND we haven't started one yet
            if (this.isLecture && !this.timerState?.isActive && !this.hasStartedInitialTimer) {
              console.log('🎯 First-time auto-start: Video playing + lecture detected + no active timer');
              this.hasStartedInitialTimer = true;
              setTimeout(() => {
                this.startWorkTimer();
              }, 1000);
            } 
            // FIXED: If timer is paused, resume it instead of starting new
            else if (this.timerState?.isActive && this.timerState?.isPaused) {
              console.log('▶️ Resuming paused timer (not starting new!)');
              await chrome.runtime.sendMessage({ type: 'RESUME_TIMER' });
            }
            // FIXED: Don't start anything if timer is already active
            else if (this.timerState?.isActive && !this.timerState?.isPaused) {
              console.log('ℹ️ Timer already running, no action needed');
            }
            else {
              console.log('ℹ️ Video play event, but conditions not met for timer action');
              console.log('   - isLecture:', this.isLecture);
              console.log('   - timerState.isActive:', this.timerState?.isActive);
              console.log('   - hasStartedInitialTimer:', this.hasStartedInitialTimer);
            }
          });

          this.video.addEventListener('pause', async (e) => {
            console.log('⏸️ Video pause event detected');

            // Sync state to get latest info
            await this.syncTimerState();

            // FIXED: Only pause timer if it's active and not already paused
            if (!this.isTimerControlledPause && this.timerState?.isActive && !this.timerState?.isPaused) {
              console.log('⏸️ Manual pause detected - pausing timer');
              await chrome.runtime.sendMessage({ type: 'PAUSE_TIMER' });
            } else if (this.isTimerControlledPause) {
              console.log('⏸️ Timer-controlled pause (expected)');
            } else {
              console.log('ℹ️ Video pause, but timer not active or already paused');
            }

            this.isTimerControlledPause = false; // Reset flag
          });

          resolve();
        } else {
          setTimeout(checkForVideo, 500);
        }
      };

      checkForVideo();
    });
  }

  async detectLectureContent() {
    try {
      console.log('🎓 Starting lecture detection...');

      if (!this.lectureDetector) {
        console.warn('⚠️ LectureDetector not available');
        return;
      }

      let detection = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts && (!detection || detection.score === 0)) {
        if (attempts > 0) {
          console.log(`🔄 Lecture detection attempt ${attempts + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        detection = this.lectureDetector.detectLecture();
        attempts++;
      }

      if (!detection) return;

      this.isLecture = detection.isLecture;

      console.log('🎓 LECTURE DETECTION COMPLETE:');
      console.log(`   📊 Score: ${detection.score} (threshold: ${detection.threshold})`);
      console.log(`   📚 Is Lecture: ${this.isLecture ? 'YES' : 'NO'}`);
      console.log(`   📄 Title: "${detection.title.substring(0, 80)}..."`);

      await chrome.runtime.sendMessage({
        type: 'LECTURE_DETECTED',
        isLecture: this.isLecture,
        score: detection.score,
        title: detection.title,
        factors: detection.factors
      });

      // Only show notification if lecture detected and no timer running
      if (this.isLecture && !this.hasShownNotification && !this.timerState?.isActive) {
        this.showLectureDetectedNotification();
      }

    } catch (error) {
      console.error('❌ Error in lecture detection:', error);
    }
  }

  showLectureDetectedNotification() {
    if (this.hasShownNotification) return;

    console.log('📚 Showing lecture notification with countdown...');

    const notification = document.createElement('div');
    notification.id = 'pomodoro-lecture-notification';
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-header">
          <span>📚 Educational Content Detected!</span>
          <button id="dismiss-btn">×</button>
        </div>
        <div class="notification-body">
          <p>Pomodoro timer will start in <span id="countdown">5</span> seconds...</p>
          <div class="notification-buttons">
            <button id="start-now-btn" class="btn-primary">Start Now</button>
            <button id="cancel-auto-btn" class="btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    `;

    this.injectCSS();
    document.body.appendChild(notification);
    this.hasShownNotification = true;

    let countdown = 5;
    const countdownEl = document.getElementById('countdown');
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdownEl) countdownEl.textContent = countdown;

      if (countdown <= 0) {
        clearInterval(countdownInterval);
        if (document.getElementById('pomodoro-lecture-notification')) {
          console.log('⏰ Auto-start countdown finished');
          this.hasStartedInitialTimer = true;
          this.startWorkTimer();
          notification.remove();
        }
      }
    }, 1000);

    document.getElementById('start-now-btn')?.addEventListener('click', () => {
      clearInterval(countdownInterval);
      this.hasStartedInitialTimer = true;
      this.startWorkTimer();
      notification.remove();
    });

    document.getElementById('cancel-auto-btn')?.addEventListener('click', () => {
      clearInterval(countdownInterval);
      this.autoStartEnabled = false;
      notification.remove();
    });

    document.getElementById('dismiss-btn')?.addEventListener('click', () => {
      clearInterval(countdownInterval);
      notification.remove();
    });
  }

  startWorkTimer() {
    console.log('🎯 startWorkTimer called');

    // FIXED: Don't start if timer already active
    if (this.timerState?.isActive) {
      console.log('⚠️ Timer already active, not starting new one');
      return;
    }

    console.log('📤 Sending START_WORK_TIMER message...');

    chrome.runtime.sendMessage({ type: 'START_WORK_TIMER' }).then(async response => {
      if (response?.success) {
        console.log('✅ Work timer started successfully');
        // Sync state after starting
        await this.syncTimerState();
        this.showOverlay('work');
      } else {
        console.error('❌ Failed to start timer:', response);
      }
    }).catch(error => {
      console.error('❌ Error starting timer:', error);
    });
  }

  showOverlay(mode) {
    console.log(`🎯 Showing ${mode} overlay`);

    if (this.overlay) this.overlay.remove();

    this.overlay = document.createElement('div');
    this.overlay.id = 'pomodoro-overlay';
    this.overlay.className = `pomodoro-overlay pomodoro-${mode}`;

    // Get duration from timer state or default
    let duration = '20:00';
    if (this.timerState?.remainingTime) {
      const minutes = Math.floor(this.timerState.remainingTime / 60000);
      const seconds = Math.floor((this.timerState.remainingTime % 60000) / 1000);
      duration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    const modeText = mode === 'work' ? '🎯 Focus Time' : '☕ Break Time';

    this.overlay.innerHTML = `
      <div class="timer-display">
        <div class="mode-text">${modeText}</div>
        <div class="time-remaining">${duration}</div>
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
        </div>
        ${mode === 'work' ? '<div class="session-info">Stay focused! 💪</div>' : ''}
        ${mode === 'break' ? `
          <div class="break-actions">
            <button id="force-resume-btn" class="force-resume-btn">
              🔴 Resume Video Now
            </button>
            <div class="break-message">Take a short break! 🧘‍♀️</div>
          </div>
        ` : ''}
        <div class="overlay-controls">
          <button id="minimize-btn" class="control-btn" title="Minimize">−</button>
          <button id="move-btn" class="control-btn" title="Move Position">⋯</button>
          <button id="pause-resume-btn" class="control-btn" title="Pause/Resume">${this.timerState?.isPaused ? '▶️' : '⏸️'}</button>
          <button id="stop-timer-btn" class="control-btn stop-btn" title="Stop Session">⏹</button>
        </div>
      </div>
    `;

    this.injectCSS();
    document.body.appendChild(this.overlay);
    this.setupOverlayControls(mode);

    console.log('✅ Overlay displayed with current timer state');
  }

  setupOverlayControls(mode) {
    if (mode === 'break') {
      document.getElementById('force-resume-btn')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'FORCE_RESUME_CLICKED' });
      });
    }

    document.getElementById('minimize-btn')?.addEventListener('click', () => {
      this.overlay.classList.toggle('minimized');
    });

    document.getElementById('move-btn')?.addEventListener('click', () => {
      this.cycleOverlayPosition();
    });

    // NEW: Manual pause/resume button
    document.getElementById('pause-resume-btn')?.addEventListener('click', async () => {
      if (this.timerState?.isPaused) {
        await chrome.runtime.sendMessage({ type: 'RESUME_TIMER' });
      } else {
        await chrome.runtime.sendMessage({ type: 'PAUSE_TIMER' });
      }
      // Update button text after action
      setTimeout(async () => {
        await this.syncTimerState();
        const btn = document.getElementById('pause-resume-btn');
        if (btn) btn.textContent = this.timerState?.isPaused ? '▶️' : '⏸️';
      }, 100);
    });

    document.getElementById('stop-timer-btn')?.addEventListener('click', () => {
      if (confirm('Stop current session?')) {
        chrome.runtime.sendMessage({ type: 'STOP_TIMER' });
        this.hideOverlay();
        this.hasStartedInitialTimer = false; // Reset so new timer can start
      }
    });
  }

  cycleOverlayPosition() {
    const positions = [
      { top: '20px', right: '20px', bottom: 'auto', left: 'auto' },
      { top: '20px', right: 'auto', bottom: 'auto', left: '20px' },
      { top: 'auto', right: '20px', bottom: '20px', left: 'auto' },
      { top: 'auto', right: 'auto', bottom: '20px', left: '20px' },
      { top: '50%', right: 'auto', bottom: 'auto', left: '20px', transform: 'translateY(-50%)' }
    ];

    const currentPos = this.overlay.getAttribute('data-position') || '0';
    const nextPos = (parseInt(currentPos) + 1) % positions.length;

    const pos = positions[nextPos];
    Object.assign(this.overlay.style, pos);
    this.overlay.setAttribute('data-position', nextPos);

    console.log(`📍 Overlay moved to position ${nextPos + 1}`);
  }

  updateOverlay(remainingMs, mode, sessionCount = 0, isPaused = false) {
    if (!this.overlay) return;

    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    const timeDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const timeElement = this.overlay.querySelector('.time-remaining');
    if (timeElement) {
      timeElement.textContent = timeDisplay;
      // Visual feedback for paused state
      timeElement.style.opacity = isPaused ? '0.6' : '1';
    }

    // Update pause/resume button
    const pauseBtn = this.overlay.querySelector('#pause-resume-btn');
    if (pauseBtn) {
      pauseBtn.textContent = isPaused ? '▶️' : '⏸️';
      pauseBtn.title = isPaused ? 'Resume Timer' : 'Pause Timer';
    }

    // Update progress - use settings for total duration
    const workDuration = 20 * 60 * 1000; // Default, should come from settings
    const breakDuration = 5 * 60 * 1000;
    const totalDuration = mode === 'work' ? workDuration : breakDuration;
    const progress = ((totalDuration - remainingMs) / totalDuration) * 100;

    const progressFill = this.overlay.querySelector('.progress-fill');
    if (progressFill) {
      progressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    }

    if (mode === 'work' && sessionCount > 0) {
      const sessionInfo = this.overlay.querySelector('.session-info');
      if (sessionInfo) {
        const status = isPaused ? '⏸️ Paused' : '💪 Stay focused!';
        sessionInfo.textContent = `Session ${sessionCount} - ${status}`;
      }
    }
  }

  hideOverlay() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  pauseVideo() {
    console.log('⏸️ Pausing video (timer-controlled)');
    this.isTimerControlledPause = true;

    if (this.videoController) {
      this.videoController.pauseVideo();
    } else if (this.video && !this.video.paused) {
      this.video.pause();
    }
  }

  resumeVideo() {
    console.log('▶️ Resuming video');

    if (this.videoController) {
      this.videoController.resumeVideo();
    } else if (this.video && this.video.paused) {
      const playPromise = this.video.play();
      if (playPromise) {
        playPromise.catch(error => {
          console.log('Autoplay blocked, user needs to click play');
        });
      }
    }
  }

  async handleMessage(message, sender, sendResponse) {
    console.log('📨 Content script received:', message.type);

    switch (message.type) {
      case 'TIMER_TICK':
        // Update local state and overlay
        this.timerState = {
          isActive: true,
          mode: message.mode,
          remainingTime: message.remainingTime,
          sessionCount: message.sessionCount,
          isPaused: message.isPaused || false
        };
        this.updateOverlay(message.remainingTime, message.mode, message.sessionCount, message.isPaused);
        break;

      case 'WORK_TIMER_FINISHED':
        console.log('⏰ Work session complete');
        this.pauseVideo();
        this.startBreakTimer();
        break;

      case 'BREAK_TIMER_FINISHED':
        console.log('☕ Break complete');
        this.resumeVideo();
        this.hideOverlay();
        this.hasStartedInitialTimer = false; // Reset for next session
        setTimeout(() => this.startWorkTimer(), 1000);
        break;

      case 'FORCE_RESUME':
        console.log('🔴 Force resume');
        this.resumeVideo();
        this.hideOverlay();
        this.hasStartedInitialTimer = false;
        break;

      case 'MANUAL_LECTURE_TOGGLE':
        console.log('📚 Manual lecture toggle:', message.isLecture);
        this.isLecture = message.isLecture;

        if (message.isLecture) {
          this.lectureDetector.markAsLecture();
          // Reset initial timer flag so notification can show
          this.hasShownNotification = false;
          this.showLectureDetectedNotification();
        } else {
          this.lectureDetector.markAsNonLecture();
        }

        sendResponse({ success: true });
        break;
    }
  }

  startBreakTimer() {
    chrome.runtime.sendMessage({ type: 'START_BREAK_TIMER' }).then(async response => {
      if (response?.success) {
        console.log('☕ Break timer started');
        await this.syncTimerState();
        this.showOverlay('break');
      }
    });
  }

  injectCSS() {
    if (document.getElementById('pomodoro-css-injected')) return;

    const style = document.createElement('style');
    style.id = 'pomodoro-css-injected';
    style.textContent = `
      #pomodoro-lecture-notification {
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        color: white !important;
        padding: 0 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5) !important;
        z-index: 999998 !important;
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif !important;
        max-width: 350px !important;
        animation: slideInRight 0.3s ease-out !important;
      }

      .notification-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 16px 20px 12px 20px !important;
        font-weight: 700 !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2) !important;
      }

      .notification-body {
        padding: 16px 20px !important;
      }

      .notification-buttons {
        display: flex !important;
        gap: 10px !important;
        margin-top: 12px !important;
      }

      .btn-primary, .btn-secondary {
        padding: 8px 16px !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        font-weight: 600 !important;
        border: none !important;
        flex: 1 !important;
      }

      .btn-primary { background: rgba(76, 175, 80, 0.9) !important; color: white !important; }
      .btn-secondary { background: rgba(255, 255, 255, 0.2) !important; color: white !important; }

      #countdown { font-weight: bold !important; color: #FFD700 !important; }

      .pomodoro-overlay {
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        background: rgba(0, 0, 0, 0.92) !important;
        backdrop-filter: blur(12px) !important;
        border-radius: 16px !important;
        padding: 20px !important;
        min-width: 320px !important;
        z-index: 999999 !important;
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif !important;
        color: white !important;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6) !important;
        border: 2px solid rgba(255, 255, 255, 0.15) !important;
        transition: all 0.3s ease !important;
      }

      .pomodoro-overlay.minimized { transform: scale(0.7) !important; opacity: 0.7 !important; }
      .pomodoro-work { border-left: 4px solid #4CAF50 !important; }
      .pomodoro-break { border-left: 4px solid #FF9800 !important; }

      .timer-display { text-align: center !important; }
      .mode-text { font-size: 18px !important; font-weight: 700 !important; margin-bottom: 12px !important; }
      .time-remaining { 
        font-size: 48px !important; 
        font-weight: 700 !important; 
        margin: 16px 0 !important; 
        font-family: 'Monaco', monospace !important;
        text-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
        transition: opacity 0.3s ease !important;
      }

      .progress-container { margin: 16px 0 !important; }
      .progress-bar { 
        width: 100% !important; 
        height: 8px !important; 
        background: rgba(255, 255, 255, 0.2) !important; 
        border-radius: 4px !important; 
        overflow: hidden !important;
      }
      .progress-fill { 
        height: 100% !important; 
        width: 0% !important; 
        background: linear-gradient(90deg, #4CAF50, #45a049) !important; 
        transition: width 0.5s ease !important;
      }

      .session-info { 
        font-size: 14px !important; 
        margin: 12px 0 !important; 
        opacity: 0.9 !important;
        font-style: italic !important;
      }

      .overlay-controls {
        display: flex !important;
        justify-content: center !important;
        gap: 8px !important;
        margin-top: 16px !important;
      }

      .control-btn {
        background: rgba(255, 255, 255, 0.15) !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        color: white !important;
        width: 36px !important;
        height: 36px !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        font-size: 14px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: all 0.2s ease !important;
      }

      .control-btn:hover {
        background: rgba(255, 255, 255, 0.25) !important;
        transform: scale(1.1) !important;
      }

      .stop-btn:hover { background: rgba(244, 67, 54, 0.8) !important; }

      .force-resume-btn {
        background: linear-gradient(135deg, #FF6B6B, #ee5a52) !important;
        border: none !important;
        color: white !important;
        padding: 12px 24px !important;
        border-radius: 8px !important;
        cursor: pointer !important;
        font-size: 14px !important;
        font-weight: 700 !important;
        width: 100% !important;
        margin: 16px 0 12px 0 !important;
      }

      .break-message {
        font-size: 14px !important;
        text-align: center !important;
        opacity: 0.8 !important;
        color: #FFB74D !important;
        font-style: italic !important;
      }

      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;

    document.head.appendChild(style);
  }

  setupNavigationListener() {
    let currentUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        if (currentUrl.includes('/watch')) {
          console.log('🔄 YouTube navigation - resetting state');
          this.hideOverlay();
          this.isLecture = false;
          this.hasShownNotification = false;
          this.hasStartedInitialTimer = false; // Reset on navigation
          this.autoStartEnabled = true;

          setTimeout(async () => {
            await this.waitForVideo();
            await this.detectLectureContent();
          }, 2000);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// Initialize
console.log('🍅 Starting FINAL FIXED YouTube Pomodoro Timer...');
new YouTubePomodoroTimer();