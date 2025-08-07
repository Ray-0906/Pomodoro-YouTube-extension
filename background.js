// background.js - ULTIMATE FIXED VERSION

class PomodoroTimerManager {
  constructor() {
    this.timerState = {
      mode: null, // 'work' or 'break'
      startTime: null,
      duration: null,
      remainingTime: null,
      isActive: false,
      isPaused: false, // NEW: track pause state
      currentTab: null,
      sessionCount: 0,
      pausedTime: null // NEW: when paused
    };

    // Load settings on startup
    this.settings = {
      workDuration: 20,
      breakDuration: 5,
      autoDetectLectures: true,
      enableNotifications: true,
      autoResume: true
    };

    this.tickInterval = null;

    this.init();
  }

  async init() {
    console.log('🍅 PomodoroTimerManager: Initializing...');

    // Load user settings first
    await this.loadSettings();

    // Listen for messages from content script and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep channel open for async responses
    });

    // Listen for alarm events
    chrome.alarms.onAlarm.addListener((alarm) => {
      this.handleAlarm(alarm);
    });

    // Restore state on startup
    await this.restoreState();

    console.log('✅ PomodoroTimerManager initialized with settings:', this.settings);
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['pomodoroSettings']);
      if (result.pomodoroSettings) {
        this.settings = { ...this.settings, ...result.pomodoroSettings };
        console.log('⚙️ Settings loaded:', this.settings);
      }
    } catch (error) {
      console.error('❌ Error loading settings:', error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      console.log('📨 Background received message:', message.type);

      switch (message.type) {
        case 'START_WORK_TIMER':
          // Use settings duration, not hardcoded
          const workDuration = this.settings.workDuration * 60 * 1000;
          await this.startTimer('work', workDuration, sender.tab);
          sendResponse({ success: true });
          break;

        case 'START_BREAK_TIMER':
          // Use settings duration, not hardcoded
          const breakDuration = this.settings.breakDuration * 60 * 1000;
          await this.startTimer('break', breakDuration, sender.tab);
          sendResponse({ success: true });
          break;

        case 'PAUSE_TIMER':
          await this.pauseTimer();
          sendResponse({ success: true });
          break;

        case 'RESUME_TIMER':
          await this.resumeTimer();
          sendResponse({ success: true });
          break;

        case 'STOP_TIMER':
          await this.stopTimer();
          sendResponse({ success: true });
          break;

        case 'FORCE_RESUME_CLICKED':
          await this.forceResume(sender.tab);
          sendResponse({ success: true });
          break;

        case 'GET_TIMER_STATE':
          sendResponse(this.timerState);
          break;

        case 'LECTURE_DETECTED':
          await this.handleLectureDetection(message, sender.tab);
          sendResponse({ success: true });
          break;

        case 'VIDEO_PAUSED_BY_USER':
          // NEW: Handle user pause without creating new session
          if (this.timerState.isActive && !this.timerState.isPaused) {
            console.log('⏸️ User paused video - pausing timer');
            await this.pauseTimer();
          }
          sendResponse({ success: true });
          break;

        case 'VIDEO_RESUMED_BY_USER':
          // NEW: Handle user resume
          if (this.timerState.isActive && this.timerState.isPaused) {
            console.log('▶️ User resumed video - resuming timer');
            await this.resumeTimer();
          }
          sendResponse({ success: true });
          break;

        case 'SETTINGS_UPDATED':
          await this.loadSettings(); // Reload settings
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
      sendResponse({ error: error.message });
    }
  }

  async startTimer(mode, duration, tab) {
    try {
      console.log(`🎯 Starting ${mode} timer for ${duration/1000} seconds`);

      // Clear any existing timer
      await chrome.alarms.clear('pomodoroTimer');
      if (this.tickInterval) {
        clearInterval(this.tickInterval);
      }

      this.timerState = {
        mode: mode,
        startTime: Date.now(),
        duration: duration,
        remainingTime: duration,
        isActive: true,
        isPaused: false,
        currentTab: tab?.id || null,
        sessionCount: mode === 'work' ? this.timerState.sessionCount + 1 : this.timerState.sessionCount,
        pausedTime: null
      };

      // Save state
      await chrome.storage.local.set({ timerState: this.timerState });

      // Set alarm for timer completion
      await chrome.alarms.create('pomodoroTimer', {
        delayInMinutes: duration / (60 * 1000)
      });

      // Start tick interval for UI updates
      this.startTicking();

      console.log(`✅ ${mode} timer started for session ${this.timerState.sessionCount}`);
    } catch (error) {
      console.error('❌ Error starting timer:', error);
    }
  }

  // NEW: Pause timer without stopping it
  async pauseTimer() {
    if (!this.timerState.isActive || this.timerState.isPaused) {
      return;
    }

    console.log('⏸️ Pausing timer...');

    // Calculate how much time was used
    const elapsed = Date.now() - this.timerState.startTime;
    this.timerState.remainingTime = Math.max(0, this.timerState.duration - elapsed);
    this.timerState.isPaused = true;
    this.timerState.pausedTime = Date.now();

    // Clear alarm and ticker
    await chrome.alarms.clear('pomodoroTimer');
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // Save state
    await chrome.storage.local.set({ timerState: this.timerState });

    console.log(`⏸️ Timer paused with ${Math.floor(this.timerState.remainingTime/1000)} seconds remaining`);
  }

  // NEW: Resume paused timer
  async resumeTimer() {
    if (!this.timerState.isActive || !this.timerState.isPaused) {
      return;
    }

    console.log('▶️ Resuming timer...');

    // Update start time to account for pause
    this.timerState.startTime = Date.now();
    this.timerState.duration = this.timerState.remainingTime;
    this.timerState.isPaused = false;
    this.timerState.pausedTime = null;

    // Set new alarm for remaining time
    await chrome.alarms.create('pomodoroTimer', {
      delayInMinutes: this.timerState.remainingTime / (60 * 1000)
    });

    // Restart ticking
    this.startTicking();

    // Save state
    await chrome.storage.local.set({ timerState: this.timerState });

    console.log(`▶️ Timer resumed with ${Math.floor(this.timerState.remainingTime/1000)} seconds remaining`);
  }

  async stopTimer() {
    try {
      console.log('⏹️ Stopping timer...');

      await chrome.alarms.clear('pomodoroTimer');

      if (this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }

      // Record partial session if it was significant (>2 minutes)
      if (this.timerState.isActive && this.timerState.duration > 120000) {
        await this.recordSession(this.timerState.mode + '_stopped');
      }

      this.timerState = {
        mode: null,
        startTime: null,
        duration: null,
        remainingTime: null,
        isActive: false,
        isPaused: false,
        currentTab: null,
        sessionCount: this.timerState.sessionCount,
        pausedTime: null
      };

      await chrome.storage.local.set({ timerState: this.timerState });

      console.log('✅ Timer stopped');
    } catch (error) {
      console.error('❌ Error stopping timer:', error);
    }
  }

  startTicking() {
    // Clear any existing tick interval
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
    }

    // Update UI every second
    this.tickInterval = setInterval(async () => {
      if (!this.timerState.isActive || this.timerState.isPaused) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
        return;
      }

      const elapsed = Date.now() - this.timerState.startTime;
      this.timerState.remainingTime = Math.max(0, this.timerState.duration - elapsed);

      // Send update to content script
      if (this.timerState.currentTab) {
        try {
          await chrome.tabs.sendMessage(this.timerState.currentTab, {
            type: 'TIMER_TICK',
            remainingTime: this.timerState.remainingTime,
            mode: this.timerState.mode,
            sessionCount: this.timerState.sessionCount,
            isPaused: this.timerState.isPaused
          });
        } catch (error) {
          // Tab might be closed, ignore error
          console.log('Tab closed or content script not ready');
        }
      }

      // Stop if timer finished
      if (this.timerState.remainingTime <= 0) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }
    }, 1000);
  }

  async handleAlarm(alarm) {
    if (alarm.name === 'pomodoroTimer') {
      await this.timerFinished();
    }
  }

  async timerFinished() {
    const mode = this.timerState.mode;

    console.log(`⏰ ${mode} timer finished!`);

    // Send notification
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon-48.png',
        title: 'YouTube Pomodoro Timer',
        message: mode === 'work' 
          ? 'Focus session complete! Time for a break.' 
          : 'Break time over! Ready to focus again?'
      });
    } catch (error) {
      console.error('❌ Error creating notification:', error);
    }

    // Notify content script
    if (this.timerState.currentTab) {
      const messageType = mode === 'work' ? 'WORK_TIMER_FINISHED' : 'BREAK_TIMER_FINISHED';
      try {
        await chrome.tabs.sendMessage(this.timerState.currentTab, {
          type: messageType
        });
      } catch (error) {
        console.error('❌ Error sending timer finished message:', error);
      }
    }

    // Record session statistics
    await this.recordSession(mode);

    // Reset timer state if break finished
    if (mode === 'break') {
      this.timerState.isActive = false;
      await chrome.storage.local.set({ timerState: this.timerState });
    }
  }

  async forceResume(tab) {
    try {
      console.log('🔴 Force resume triggered');

      // Clear break timer
      await chrome.alarms.clear('pomodoroTimer');

      if (this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }

      this.timerState.isActive = false;

      // Notify content script
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'FORCE_RESUME'
        });
      }

      // Record interrupted break
      await this.recordSession('break_interrupted');

      await chrome.storage.local.set({ timerState: this.timerState });

      console.log('✅ Break timer force resumed');
    } catch (error) {
      console.error('❌ Error force resuming:', error);
    }
  }

  async handleLectureDetection(message, tab) {
    try {
      // Store lecture detection data for analytics
      const result = await chrome.storage.local.get(['detectionStats']);
      const stats = result.detectionStats || [];

      stats.push({
        timestamp: Date.now(),
        tabId: tab?.id || null,
        isLecture: message.isLecture,
        score: message.score,
        title: message.title,
        url: tab?.url || null,
        factors: message.factors || []
      });

      // Keep only last 100 detections
      if (stats.length > 100) {
        stats.splice(0, stats.length - 100);
      }

      await chrome.storage.local.set({ detectionStats: stats });

      console.log(`📚 Lecture detection logged: ${message.isLecture ? 'YES' : 'NO'}, Score: ${message.score}`);
    } catch (error) {
      console.error('❌ Error handling lecture detection:', error);
    }
  }

  async recordSession(mode) {
    try {
      const result = await chrome.storage.local.get(['sessionHistory']);
      const history = result.sessionHistory || [];

      const session = {
        timestamp: Date.now(),
        mode: mode,
        duration: this.timerState.duration || 0,
        completed: !mode.includes('_stopped') && !mode.includes('_interrupted'),
        sessionNumber: this.timerState.sessionCount,
        actualWorkDuration: this.settings.workDuration,
        actualBreakDuration: this.settings.breakDuration
      };

      history.push(session);

      // Keep only last 1000 sessions
      if (history.length > 1000) {
        history.splice(0, history.length - 1000);
      }

      await chrome.storage.local.set({ sessionHistory: history });

      console.log(`📊 Session recorded: ${mode}, completed: ${session.completed}`);
    } catch (error) {
      console.error('❌ Error recording session:', error);
    }
  }

  async restoreState() {
    try {
      const result = await chrome.storage.local.get(['timerState']);
      if (result.timerState) {
        this.timerState = result.timerState;

        // Check if timer should still be running
        if (this.timerState.isActive && this.timerState.startTime && !this.timerState.isPaused) {
          const elapsed = Date.now() - this.timerState.startTime;

          if (elapsed < this.timerState.duration) {
            // Timer should still be running
            this.timerState.remainingTime = this.timerState.duration - elapsed;
            this.startTicking();

            console.log('⏰ Timer state restored and resumed');
          } else {
            // Timer should have finished while extension was inactive
            this.timerState.isActive = false;
            await chrome.storage.local.set({ timerState: this.timerState });

            console.log('⏰ Timer had finished while inactive');
          }
        } else if (this.timerState.isPaused) {
          console.log('⏸️ Timer state restored (paused)');
        }
      }
    } catch (error) {
      console.error('❌ Error restoring state:', error);
    }
  }
}

// Initialize timer manager
new PomodoroTimerManager();