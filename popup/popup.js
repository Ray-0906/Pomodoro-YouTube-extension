// popup.js - FINAL FIXED VERSION with proper sync

class PomodoroPopup {
  constructor() {
    this.timerState = null;
    this.currentTab = null;
    this.settings = {
      workDuration: 20,
      breakDuration: 5,
      autoDetectLectures: true,
      enableNotifications: true,
      autoResume: true
    };

    this.updateInterval = null; // NEW: Regular updates

    console.log('🍅 Popup initialized with sync');
    this.init();
  }

  async init() {
    try {
      await this.getCurrentTab();
      await this.loadSettings();
      await this.loadTimerState();
      await this.loadStats();

      this.setupEventListeners();
      this.updateUI();
      await this.checkCurrentTab();

      // NEW: Start regular sync updates
      this.startSyncUpdates();

      console.log('✅ Popup initialized with regular sync updates');
    } catch (error) {
      console.error('❌ Error initializing popup:', error);
    }
  }

  // NEW: Regular sync updates to keep popup in sync
  startSyncUpdates() {
    // Update every 500ms when popup is open
    this.updateInterval = setInterval(async () => {
      try {
        await this.loadTimerState();
        this.updateUI();
        this.updateTimerDisplay();
      } catch (error) {
        // Silently handle errors (popup might be closing)
      }
    }, 500);

    // Clean up when popup closes
    window.addEventListener('beforeunload', () => {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
      }
    });
  }

  async getCurrentTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tabs[0];
    } catch (error) {
      console.error('❌ Error getting current tab:', error);
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['pomodoroSettings']);
      if (result.pomodoroSettings) {
        this.settings = { ...this.settings, ...result.pomodoroSettings };
      }
      this.updateSettingsUI();
    } catch (error) {
      console.error('❌ Error loading settings:', error);
    }
  }

  async loadTimerState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' });
      if (response) {
        this.timerState = response;
        // console.log('⏱️ Timer state synced:', this.timerState);
      }
    } catch (error) {
      // Popup might be closing, ignore error
    }
  }

  async loadStats() {
    try {
      const result = await chrome.storage.local.get(['sessionHistory']);
      const sessions = result.sessionHistory || [];

      const today = new Date().toDateString();
      const todaySessions = sessions.filter(session => 
        new Date(session.timestamp).toDateString() === today
      );

      const completedSessions = todaySessions.filter(s => s.completed && s.mode === 'work');
      const totalFocusTime = completedSessions.reduce((total, session) => 
        total + (session.duration / (1000 * 60)), 0
      );

      const completionRate = todaySessions.length > 0 
        ? Math.round((completedSessions.length / todaySessions.filter(s => s.mode === 'work').length) * 100) || 0
        : 0;

      const sessionsEl = document.getElementById('sessions-today');
      const focusTimeEl = document.getElementById('focus-time-today');  
      const completionEl = document.getElementById('completion-rate');

      if (sessionsEl) sessionsEl.textContent = completedSessions.length;
      if (focusTimeEl) focusTimeEl.textContent = `${Math.round(totalFocusTime)}m`;
      if (completionEl) completionEl.textContent = `${completionRate}%`;

    } catch (error) {
      console.error('❌ Error loading stats:', error);
    }
  }

  setupEventListeners() {
    // Start focus session
    const startBtn = document.getElementById('start-focus-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.startFocusSession();
      });
    }

    // Session controls
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.pauseSession();
      });
    }

    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        this.stopSession();
      });
    }

    // Manual lecture marking
    const manualLectureBtn = document.getElementById('manual-lecture-btn');
    if (manualLectureBtn) {
      manualLectureBtn.addEventListener('click', () => {
        this.toggleLectureStatus();
      });
    }

    // Settings
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.showSettings();
      });
    }

    const closeSettingsBtn = document.getElementById('close-settings');
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => {
        this.hideSettings();
      });
    }

    const saveSettingsBtn = document.getElementById('save-settings');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => {
        this.saveSettings();
      });
    }

    const resetStatsBtn = document.getElementById('reset-stats');
    if (resetStatsBtn) {
      resetStatsBtn.addEventListener('click', () => {
        this.resetStats();
      });
    }

    // Settings inputs
    const workDurationSlider = document.getElementById('work-duration');
    const breakDurationSlider = document.getElementById('break-duration');

    if (workDurationSlider) {
      workDurationSlider.addEventListener('input', (e) => {
        const valueSpan = document.getElementById('work-duration-value');
        if (valueSpan) {
          valueSpan.textContent = `${e.target.value} min`;
        }
      });
    }

    if (breakDurationSlider) {
      breakDurationSlider.addEventListener('input', (e) => {
        const valueSpan = document.getElementById('break-duration-value');
        if (valueSpan) {
          valueSpan.textContent = `${e.target.value} min`;
        }
      });
    }
  }

  async startFocusSession() {
    try {
      if (!this.currentTab) {
        await this.getCurrentTab();
      }

      if (!this.currentTab || !this.currentTab.url.includes('youtube.com/watch')) {
        this.showMessage('Please navigate to a YouTube video first', 'warning');
        return;
      }

      const response = await chrome.runtime.sendMessage({ type: 'START_WORK_TIMER' });

      if (response && response.success) {
        this.showMessage('Focus session started!', 'success');
        await this.loadTimerState();
        this.updateUI();

        try {
          await chrome.tabs.sendMessage(this.currentTab.id, {
            type: 'FORCE_START_TIMER'
          });
        } catch (contentError) {
          console.log('Content script notification failed');
        }
      } else {
        this.showMessage('Failed to start session', 'error');
      }
    } catch (error) {
      console.error('❌ Error starting focus session:', error);
      this.showMessage('Error starting session', 'error');
    }
  }

  async pauseSession() {
    try {
      const messageType = this.timerState?.isPaused ? 'RESUME_TIMER' : 'PAUSE_TIMER';
      const actionText = this.timerState?.isPaused ? 'resumed' : 'paused';

      await chrome.runtime.sendMessage({ type: messageType });
      this.showMessage(`Session ${actionText}`, 'info');
      await this.loadTimerState();
      this.updateUI();
    } catch (error) {
      console.error('❌ Error pausing/resuming session:', error);
    }
  }

  async stopSession() {
    try {
      if (confirm('Are you sure you want to stop the current session?')) {
        await chrome.runtime.sendMessage({ type: 'STOP_TIMER' });
        this.showMessage('Session stopped', 'info');
        await this.loadTimerState();
        this.updateUI();
      }
    } catch (error) {
      console.error('❌ Error stopping session:', error);
    }
  }

  async toggleLectureStatus() {
    try {
      if (!this.currentTab) {
        await this.getCurrentTab();
      }

      if (!this.currentTab || !this.currentTab.url.includes('youtube.com/watch')) {
        this.showMessage('Please navigate to a YouTube video first', 'warning');
        return;
      }

      const videoId = this.extractVideoId(this.currentTab.url);
      const overrides = await this.getLectureOverrides();
      const currentStatus = overrides[videoId];

      const newStatus = currentStatus === true ? false : true;
      overrides[videoId] = newStatus;

      await chrome.storage.local.set({ lectureOverrides: overrides });
      await this.updateLectureButtonText(newStatus);

      try {
        const response = await chrome.tabs.sendMessage(this.currentTab.id, {
          type: 'MANUAL_LECTURE_TOGGLE',
          isLecture: newStatus,
          videoId: videoId
        });

        if (newStatus) {
          this.showMessage('Video marked as lecture - timer will auto-start', 'success');

          setTimeout(() => {
            if (confirm('Start focus session now?')) {
              this.startFocusSession();
            }
          }, 500);
        } else {
          this.showMessage('Video marked as non-lecture', 'info');
        }

      } catch (contentError) {
        console.error('Failed to notify content script:', contentError);
        this.showMessage('Status saved, but may need page refresh', 'warning');
      }

    } catch (error) {
      console.error('❌ Error toggling lecture status:', error);
      this.showMessage('Error updating lecture status', 'error');
    }
  }

  extractVideoId(url) {
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : url;
  }

  async getLectureOverrides() {
    try {
      const result = await chrome.storage.local.get(['lectureOverrides']);
      return result.lectureOverrides || {};
    } catch (error) {
      console.error('Error loading lecture overrides:', error);
      return {};
    }
  }

  async updateLectureButtonText(isLecture) {
    const button = document.getElementById('manual-lecture-btn');
    if (button) {
      const iconSpan = button.querySelector('.btn-icon');
      const textContent = button.childNodes[button.childNodes.length - 1];

      if (isLecture) {
        if (iconSpan) iconSpan.textContent = '✅';
        if (textContent) textContent.textContent = ' Marked as Lecture';
        button.style.background = '#4CAF50';
        button.style.color = 'white';
        button.style.borderColor = '#4CAF50';
      } else {
        if (iconSpan) iconSpan.textContent = '📚';
        if (textContent) textContent.textContent = ' Mark as Lecture';
        button.style.background = '';
        button.style.color = '';
        button.style.borderColor = '';
      }
    }
  }

  showSettings() {
    const panel = document.getElementById('settings-panel');
    if (panel) {
      panel.style.display = 'flex';
    }
  }

  hideSettings() {
    const panel = document.getElementById('settings-panel');
    if (panel) {
      panel.style.display = 'none';
    }
  }

  async saveSettings() {
    try {
      const workDurationEl = document.getElementById('work-duration');
      const breakDurationEl = document.getElementById('break-duration');
      const autoDetectEl = document.getElementById('auto-detect-lectures');
      const notificationsEl = document.getElementById('enable-notifications');
      const autoResumeEl = document.getElementById('auto-resume');

      if (workDurationEl) this.settings.workDuration = parseInt(workDurationEl.value);
      if (breakDurationEl) this.settings.breakDuration = parseInt(breakDurationEl.value);
      if (autoDetectEl) this.settings.autoDetectLectures = autoDetectEl.checked;
      if (notificationsEl) this.settings.enableNotifications = notificationsEl.checked;
      if (autoResumeEl) this.settings.autoResume = autoResumeEl.checked;

      await chrome.storage.local.set({ pomodoroSettings: this.settings });

      // Notify background to reload settings
      await chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' });

      this.showMessage('Settings saved!', 'success');
      this.hideSettings();
    } catch (error) {
      console.error('❌ Error saving settings:', error);
      this.showMessage('Error saving settings', 'error');
    }
  }

  async resetStats() {
    try {
      if (confirm('Are you sure you want to reset all statistics? This cannot be undone.')) {
        await chrome.storage.local.remove(['sessionHistory', 'detectionStats']);
        await this.loadStats();
        this.showMessage('Statistics reset successfully', 'success');
      }
    } catch (error) {
      console.error('❌ Error resetting stats:', error);
    }
  }

  updateSettingsUI() {
    const workDurationEl = document.getElementById('work-duration');
    const workDurationValueEl = document.getElementById('work-duration-value');
    const breakDurationEl = document.getElementById('break-duration');
    const breakDurationValueEl = document.getElementById('break-duration-value');
    const autoDetectEl = document.getElementById('auto-detect-lectures');
    const notificationsEl = document.getElementById('enable-notifications');
    const autoResumeEl = document.getElementById('auto-resume');

    if (workDurationEl) {
      workDurationEl.value = this.settings.workDuration;
    }
    if (workDurationValueEl) {
      workDurationValueEl.textContent = `${this.settings.workDuration} min`;
    }

    if (breakDurationEl) {
      breakDurationEl.value = this.settings.breakDuration;
    }
    if (breakDurationValueEl) {
      breakDurationValueEl.textContent = `${this.settings.breakDuration} min`;
    }

    if (autoDetectEl) {
      autoDetectEl.checked = this.settings.autoDetectLectures;
    }
    if (notificationsEl) {
      notificationsEl.checked = this.settings.enableNotifications;
    }
    if (autoResumeEl) {
      autoResumeEl.checked = this.settings.autoResume;
    }
  }

  updateUI() {
    const currentSession = document.getElementById('current-session');
    const quickActions = document.getElementById('quick-actions');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');

    if (this.timerState && this.timerState.isActive) {
      // Show current session
      if (currentSession) currentSession.style.display = 'block';
      if (quickActions) quickActions.style.display = 'none';

      // Update status
      if (statusIndicator && statusText) {
        const statusDot = statusIndicator.querySelector('.status-dot');
        if (this.timerState.isPaused) {
          if (statusDot) statusDot.className = 'status-dot paused';
          statusText.textContent = 'Paused';
        } else if (this.timerState.mode === 'work') {
          if (statusDot) statusDot.className = 'status-dot active';
          statusText.textContent = 'Focusing';
        } else {
          if (statusDot) statusDot.className = 'status-dot paused';
          statusText.textContent = 'Break Time';
        }
      }

      // Update mode badge
      const modeBadge = document.getElementById('mode-badge');
      if (modeBadge) {
        modeBadge.textContent = this.timerState.mode === 'work' ? 'Focus' : 'Break';
        modeBadge.className = `mode-badge ${this.timerState.mode}`;
      }

      // Update pause/resume button text
      const pauseBtn = document.getElementById('pause-btn');
      if (pauseBtn) {
        pauseBtn.textContent = this.timerState.isPaused ? 'Resume' : 'Pause';
      }

    } else {
      // Show quick actions
      if (currentSession) currentSession.style.display = 'none';
      if (quickActions) quickActions.style.display = 'block';

      // Update status
      if (statusIndicator && statusText) {
        const statusDot = statusIndicator.querySelector('.status-dot');
        if (statusDot) statusDot.className = 'status-dot';
        statusText.textContent = 'Ready';
      }
    }
  }

  // NEW: Update timer display with real-time info
  updateTimerDisplay() {
    if (!this.timerState || !this.timerState.isActive) return;

    const timeDisplay = document.getElementById('time-display');
    const progressFill = document.getElementById('progress-fill');
    const sessionCount = document.getElementById('session-count');

    if (this.timerState.remainingTime !== undefined) {
      const minutes = Math.floor(this.timerState.remainingTime / 60000);
      const seconds = Math.floor((this.timerState.remainingTime % 60000) / 1000);
      const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

      if (timeDisplay) {
        timeDisplay.textContent = timeString;
        // Visual feedback for paused state
        timeDisplay.style.opacity = this.timerState.isPaused ? '0.6' : '1';
      }

      // Update progress
      const totalDuration = this.timerState.mode === 'work' 
        ? this.settings.workDuration * 60 * 1000 
        : this.settings.breakDuration * 60 * 1000;
      const progress = ((totalDuration - this.timerState.remainingTime) / totalDuration) * 100;

      if (progressFill) {
        progressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
      }
    }

    // Update session count
    if (sessionCount && this.timerState.sessionCount) {
      const pausedText = this.timerState.isPaused ? ' (Paused)' : '';
      sessionCount.textContent = `Session ${this.timerState.sessionCount}${pausedText}`;
    }
  }

  async checkCurrentTab() {
    try {
      if (!this.currentTab) {
        await this.getCurrentTab();
      }

      const videoInfo = document.getElementById('video-info');

      if (this.currentTab && this.currentTab.url.includes('youtube.com/watch')) {
        if (videoInfo) videoInfo.style.display = 'block';

        const title = this.currentTab.title.replace(' - YouTube', '');
        const titleEl = document.getElementById('video-title');
        if (titleEl) {
          titleEl.textContent = title;
        }

        const videoId = this.extractVideoId(this.currentTab.url);
        const overrides = await this.getLectureOverrides();
        const isMarkedAsLecture = overrides[videoId];

        await this.updateLectureButtonText(isMarkedAsLecture === true);

        const lectureStatus = document.getElementById('lecture-status');
        if (lectureStatus) {
          if (isMarkedAsLecture === true) {
            lectureStatus.innerHTML = '<span class="status-icon">✅</span><span>Manually marked as lecture</span>';
          } else if (isMarkedAsLecture === false) {
            lectureStatus.innerHTML = '<span class="status-icon">❌</span><span>Manually marked as non-lecture</span>';
          } else {
            lectureStatus.innerHTML = '<span class="status-icon">🔍</span><span>Auto-detecting content...</span>';
          }
        }

      } else {
        if (videoInfo) videoInfo.style.display = 'none';
      }
    } catch (error) {
      console.error('❌ Error checking current tab:', error);
    }
  }

  showMessage(message, type = 'info') {
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${type}`;
    messageEl.textContent = message;

    Object.assign(messageEl.style, {
      position: 'fixed',
      top: '10px',
      left: '10px',
      right: '10px',
      padding: '12px',
      borderRadius: '6px',
      zIndex: '10000',
      fontSize: '14px',
      fontWeight: '500',
      textAlign: 'center',
      animation: 'slideDown 0.3s ease-out'
    });

    const colors = {
      success: { bg: '#d4edda', border: '#c3e6cb', text: '#155724' },
      error: { bg: '#f8d7da', border: '#f5c6cb', text: '#721c24' },
      warning: { bg: '#fff3cd', border: '#ffeaa7', text: '#856404' },
      info: { bg: '#d1ecf1', border: '#bee5eb', text: '#0c5460' }
    };

    const color = colors[type] || colors.info;
    messageEl.style.backgroundColor = color.bg;
    messageEl.style.border = `1px solid ${color.border}`;
    messageEl.style.color = color.text;

    document.body.appendChild(messageEl);

    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.remove();
      }
    }, 3000);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new PomodoroPopup();
});