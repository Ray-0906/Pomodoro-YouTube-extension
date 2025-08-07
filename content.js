// content.js - FINAL FIX with break end choice and proper popup display

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
    this.hasStartedInitialTimer = false;
    this.breakEndNotification = null; // NEW: Track break end notification

    console.log('🍅 YouTubePomodoroTimer: Final version with break choice...');
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
      console.log('🍅 Setting up with break end choice logic...');

      this.lectureDetector = new LectureDetector();
      this.videoController = new VideoController();

      await this.waitForVideo();
      await this.syncTimerState();

      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
      });

      this.setupNavigationListener();

      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.detectLectureContent();

      this.isInitialized = true;
      console.log('✅ YouTube Pomodoro Timer initialized with break end choice');

    } catch (error) {
      console.error('❌ Error setting up:', error);
    }
  }

  async syncTimerState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' });
      this.timerState = response;

      if (this.timerState?.isActive) {
        console.log('📊 Synced active timer state:', this.timerState);
        this.showOverlay(this.timerState.mode);

        if (this.timerState.mode === 'work') {
          this.hasStartedInitialTimer = true;
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

          this.video.addEventListener('play', async (e) => {
            console.log('▶️ Video play event detected');

            await this.syncTimerState();

            if (this.isLecture && !this.timerState?.isActive && !this.hasStartedInitialTimer) {
              console.log('🎯 First-time auto-start: Video playing + lecture detected + no active timer');
              this.hasStartedInitialTimer = true;
              setTimeout(() => {
                this.startWorkTimer();
              }, 1000);
            } 
            else if (this.timerState?.isActive && this.timerState?.isPaused) {
              console.log('▶️ Resuming paused timer (not starting new!)');
              await chrome.runtime.sendMessage({ type: 'RESUME_TIMER' });
            }
            else if (this.timerState?.isActive && !this.timerState?.isPaused) {
              console.log('ℹ️ Timer already running, no action needed');
            }
            else {
              console.log('ℹ️ Video play event, but conditions not met for timer action');
            }
          });

          this.video.addEventListener('pause', async (e) => {
            console.log('⏸️ Video pause event detected');

            await this.syncTimerState();

            if (!this.isTimerControlledPause && this.timerState?.isActive && !this.timerState?.isPaused) {
              console.log('⏸️ Manual pause detected - pausing timer');
              await chrome.runtime.sendMessage({ type: 'PAUSE_TIMER' });
            } else if (this.isTimerControlledPause) {
              console.log('⏸️ Timer-controlled pause (expected)');
            }

            this.isTimerControlledPause = false;
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

      await chrome.runtime.sendMessage({
        type: 'LECTURE_DETECTED',
        isLecture: this.isLecture,
        score: detection.score,
        title: detection.title,
        factors: detection.factors
      });

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

  // NEW: Show break end choice notification
  showBreakEndChoice() {
    console.log('☕ Showing break end choice notification...');

    // Remove any existing break notification
    if (this.breakEndNotification) {
      this.breakEndNotification.remove();
    }

    this.breakEndNotification = document.createElement('div');
    this.breakEndNotification.id = 'pomodoro-break-end-notification';
    this.breakEndNotification.innerHTML = `
      <div class="break-end-content">
        <div class="break-end-header">
          <span>☕ Break Time Complete!</span>
        </div>
        <div class="break-end-body">
          <p>Ready for your next focus session?</p>
          <div class="break-end-countdown">
            <p>Auto-starting new session in <span id="break-countdown">15</span> seconds...</p>
          </div>
          <div class="break-end-buttons">
            <button id="start-new-session-btn" class="btn-success">🎯 Start New Session</button>
            <button id="stop-pomodoro-btn" class="btn-danger">⏹ Stop Pomodoro</button>
          </div>
        </div>
      </div>
    `;

    this.injectCSS();
    document.body.appendChild(this.breakEndNotification);

    // 15-second countdown
    let countdown = 15;
    const countdownEl = document.getElementById('break-countdown');
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdownEl) countdownEl.textContent = countdown;

      if (countdown <= 0) {
        clearInterval(countdownInterval);
        console.log('⏰ Break end countdown finished - auto-starting new session');
        this.startNewSessionAfterBreak();
        this.removeBreakEndNotification();
      }
    }, 1000);

    // Event listeners
    document.getElementById('start-new-session-btn')?.addEventListener('click', () => {
      clearInterval(countdownInterval);
      console.log('🎯 User chose to start new session');
      this.startNewSessionAfterBreak();
      this.removeBreakEndNotification();
    });

    document.getElementById('stop-pomodoro-btn')?.addEventListener('click', () => {
      clearInterval(countdownInterval);
      console.log('⏹ User chose to stop pomodoro');
      this.stopPomodoroSessions();
      this.removeBreakEndNotification();
    });
  }

  removeBreakEndNotification() {
    if (this.breakEndNotification) {
      this.breakEndNotification.remove();
      this.breakEndNotification = null;
    }
  }

  // NEW: Start new session after break
  startNewSessionAfterBreak() {
    console.log('🎯 Starting new session after break...');
    this.resumeVideo();
    this.hideOverlay();

    // Small delay before starting new timer
    setTimeout(() => {
      this.startWorkTimer();
    }, 1000);
  }

  // NEW: Stop all pomodoro sessions
  stopPomodoroSessions() {
    console.log('⏹ Stopping all pomodoro sessions...');
    chrome.runtime.sendMessage({ type: 'STOP_TIMER' });
    this.hideOverlay();
    this.hasStartedInitialTimer = false;

    // Show completion message
    this.showCompletionMessage();
  }

  // NEW: Show completion message
  showCompletionMessage() {
    const completionMsg = document.createElement('div');
    completionMsg.id = 'pomodoro-completion-message';
    completionMsg.innerHTML = `
      <div class="completion-content">
        <div class="completion-header">
          <span>🎉 Pomodoro Session Complete!</span>
        </div>
        <div class="completion-body">
          <p>Great work! You've successfully completed your focus session.</p>
          <p>Take a well-deserved break! 🧘‍♀️</p>
        </div>
      </div>
    `;

    this.injectCSS();
    document.body.appendChild(completionMsg);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (completionMsg.parentNode) {
        completionMsg.remove();
      }
    }, 5000);
  }

  startWorkTimer() {
    console.log('🎯 startWorkTimer called');

    if (this.timerState?.isActive) {
      console.log('⚠️ Timer already active, not starting new one');
      return;
    }

    console.log('📤 Sending START_WORK_TIMER message...');

    chrome.runtime.sendMessage({ type: 'START_WORK_TIMER' }).then(async response => {
      if (response?.success) {
        console.log('✅ Work timer started successfully');
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
    let duration = mode === 'work' ? '20:00' : '05:00';
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
            <div class="break-message">Enjoy your break! 🧘‍♀️</div>
            <div class="break-info">Next session will start automatically after break</div>
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
    document.getElementById('minimize-btn')?.addEventListener('click', () => {
      this.overlay.classList.toggle('minimized');
    });

    document.getElementById('move-btn')?.addEventListener('click', () => {
      this.cycleOverlayPosition();
    });

    document.getElementById('pause-resume-btn')?.addEventListener('click', async () => {
      if (this.timerState?.isPaused) {
        await chrome.runtime.sendMessage({ type: 'RESUME_TIMER' });
      } else {
        await chrome.runtime.sendMessage({ type: 'PAUSE_TIMER' });
      }
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
        this.hasStartedInitialTimer = false;
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
      timeElement.style.opacity = isPaused ? '0.6' : '1';
    }

    const pauseBtn = this.overlay.querySelector('#pause-resume-btn');
    if (pauseBtn) {
      pauseBtn.textContent = isPaused ? '▶️' : '⏸️';
      pauseBtn.title = isPaused ? 'Resume Timer' : 'Pause Timer';
    }

    // Update progress
    const workDuration = 20 * 60 * 1000; // Should come from settings
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
        console.log('⏰ Work session complete - starting break');
        this.pauseVideo();
        this.startBreakTimer();
        break;

      case 'BREAK_TIMER_FINISHED':
        console.log('☕ Break complete - showing choice notification');
        // CHANGED: Don't auto-resume, show choice instead
        this.showBreakEndChoice();
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
      /* Existing styles... */
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

      /* NEW: Break end notification styles */
      #pomodoro-break-end-notification {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%) !important;
        color: white !important;
        padding: 0 !important;
        border-radius: 16px !important;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6) !important;
        z-index: 999999 !important;
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif !important;
        min-width: 400px !important;
        animation: bounceIn 0.5s ease-out !important;
        border: 3px solid rgba(255, 255, 255, 0.3) !important;
      }

      .break-end-header {
        text-align: center !important;
        padding: 24px 32px 16px 32px !important;
        font-size: 20px !important;
        font-weight: 700 !important;
        border-bottom: 2px solid rgba(255, 255, 255, 0.2) !important;
      }

      .break-end-body {
        padding: 24px 32px !important;
        text-align: center !important;
      }

      .break-end-body p {
        margin: 0 0 16px 0 !important;
        font-size: 16px !important;
        line-height: 1.5 !important;
      }

      .break-end-countdown {
        margin: 20px 0 24px 0 !important;
        padding: 12px !important;
        background: rgba(255, 255, 255, 0.15) !important;
        border-radius: 8px !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
      }

      .break-end-countdown p {
        margin: 0 !important;
        font-weight: 600 !important;
      }

      #break-countdown {
        font-size: 18px !important;
        font-weight: bold !important;
        color: #FFD700 !important;
        text-shadow: 0 1px 2px rgba(0,0,0,0.3) !important;
      }

      .break-end-buttons {
        display: flex !important;
        gap: 16px !important;
        margin-top: 20px !important;
      }

      .btn-success {
        background: rgba(255, 255, 255, 0.9) !important;
        color: #4CAF50 !important;
        border: none !important;
        padding: 14px 24px !important;
        border-radius: 8px !important;
        cursor: pointer !important;
        font-weight: 700 !important;
        font-size: 14px !important;
        flex: 1 !important;
        transition: all 0.2s ease !important;
      }

      .btn-success:hover {
        background: white !important;
        transform: translateY(-2px) !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
      }

      .btn-danger {
        background: rgba(244, 67, 54, 0.9) !important;
        color: white !important;
        border: 1px solid rgba(255, 255, 255, 0.3) !important;
        padding: 14px 24px !important;
        border-radius: 8px !important;
        cursor: pointer !important;
        font-weight: 700 !important;
        font-size: 14px !important;
        flex: 1 !important;
        transition: all 0.2s ease !important;
      }

      .btn-danger:hover {
        background: #d32f2f !important;
        transform: translateY(-2px) !important;
        box-shadow: 0 4px 12px rgba(244, 67, 54, 0.4) !important;
      }

      /* Completion message styles */
      #pomodoro-completion-message {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        color: white !important;
        padding: 0 !important;
        border-radius: 16px !important;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6) !important;
        z-index: 999999 !important;
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif !important;
        min-width: 350px !important;
        animation: bounceIn 0.5s ease-out !important;
      }

      .completion-header {
        text-align: center !important;
        padding: 24px 32px 16px 32px !important;
        font-size: 20px !important;
        font-weight: 700 !important;
        border-bottom: 2px solid rgba(255, 255, 255, 0.2) !important;
      }

      .completion-body {
        padding: 24px 32px !important;
        text-align: center !important;
      }

      .completion-body p {
        margin: 0 0 12px 0 !important;
        font-size: 16px !important;
        line-height: 1.5 !important;
      }

      /* Existing overlay styles */
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

      .break-info {
        font-size: 12px !important;
        opacity: 0.8 !important;
        margin-top: 8px !important;
        color: #FFB74D !important;
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

      /* Animations */
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }

      @keyframes bounceIn {
        0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
        50% { transform: translate(-50%, -50%) scale(1.05); }
        70% { transform: translate(-50%, -50%) scale(0.9); }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
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
          this.removeBreakEndNotification();
          this.isLecture = false;
          this.hasShownNotification = false;
          this.hasStartedInitialTimer = false;
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
console.log('🍅 Starting FINAL YouTube Pomodoro Timer with break choice...');
new YouTubePomodoroTimer();