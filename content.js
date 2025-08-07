// content.js - ULTIMATE FIX: Auto-start control + Better minimize

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
    this.breakEndNotification = null;

    // NEW: User preference tracking
    this.userHasCancelled = false; // Track if user cancelled auto-start
    this.userHasStopped = false; // Track if user stopped session
    this.sessionWasManuallyStarted = false; // Track if session was manually started

    // NEW: Minimize state
    this.isMinimized = false;
    this.miniOverlay = null;

    console.log(
      "🍅 YouTubePomodoroTimer: Ultimate version with smart auto-start..."
    );
    this.init();
  }

  async init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.setup());
    } else {
      await this.setup();
    }
  }

  async setup() {
    try {
      console.log("🍅 Setting up with page refresh handling...");

      this.lectureDetector = new LectureDetector();
      this.videoController = new VideoController();

      await this.waitForVideo();
      await this.syncTimerState();

      // NEW: Handle page refresh scenario
      await this.handlePageRefresh();

      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
      });

      this.setupNavigationListener();

      await new Promise((resolve) => setTimeout(resolve, 2000));
      await this.detectLectureContent();

      this.isInitialized = true;
      console.log(
        "✅ YouTube Pomodoro Timer initialized with page refresh handling"
      );
    } catch (error) {
      console.error("❌ Error setting up:", error);
    }
  }

  // NEW: Add this method to handle page refresh scenarios
  async handlePageRefresh() {
    try {
      console.log("🔄 Checking for page refresh scenario...");

      if (this.timerState?.isActive) {
        console.log("⏱️ Active timer detected on page load");

        // Show overlay in current state - but start with full view on refresh
        // (since we can't persist minimize state across page refresh easily)
        this.isMinimized = false;
        this.showOverlay(this.timerState.mode);

        // Wait for video to be fully ready
        await new Promise((resolve) => setTimeout(resolve, 1500));

        if (this.video) {
          const videoPlaying = !this.video.paused;
          const timerPaused = this.timerState.isPaused;

          console.log(
            `📊 Refresh sync check: Video=${
              videoPlaying ? "playing" : "paused"
            }, Timer=${timerPaused ? "paused" : "running"}`
          );

          if (videoPlaying && timerPaused) {
            console.log(
              "🔄 Page refresh detected: Video playing but timer paused - resuming timer"
            );
            await chrome.runtime.sendMessage({ type: "RESUME_TIMER" });
            await this.syncTimerState();
            console.log("✅ Timer resumed after page refresh");
          } else if (!videoPlaying && !timerPaused) {
            console.log(
              "🔄 Page refresh detected: Video paused but timer running - pausing timer"
            );
            await chrome.runtime.sendMessage({ type: "PAUSE_TIMER" });
            await this.syncTimerState();
            console.log("✅ Timer paused after page refresh");
          } else {
            console.log(
              "✅ Timer-video sync already correct after page refresh"
            );
          }
        }

        this.hasStartedInitialTimer = true;
      } else {
        console.log("ℹ️ No active timer on page load");
      }
    } catch (error) {
      console.error("❌ Error handling page refresh:", error);
    }
  }

  async syncTimerState() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_TIMER_STATE",
      });
      this.timerState = response;

      if (this.timerState?.isActive) {
        console.log("📊 Synced active timer state:", this.timerState);
        this.showOverlay(this.timerState.mode);

        if (this.timerState.mode === "work") {
          this.hasStartedInitialTimer = true;
        }
      }
    } catch (error) {
      console.error("❌ Error syncing timer state:", error);
    }
  }

  async waitForVideo() {
    console.log("🎥 Waiting for video element...");

    return new Promise((resolve) => {
      const checkForVideo = () => {
        this.video = document.querySelector("video");

        if (this.video) {
          console.log("✅ Video element found");

          this.video.addEventListener("play", async (e) => {
            console.log("▶️ Video play event detected");

            await this.syncTimerState();

            // ENHANCED: Check if this is a resume after page refresh
            if (
              this.timerState?.isActive &&
              this.timerState?.isPaused &&
              !this.isTimerControlledPause
            ) {
              console.log(
                "🔄 Video resumed after page refresh/pause - resuming timer"
              );
              await chrome.runtime.sendMessage({ type: "RESUME_TIMER" });
              return;
            }

            // Original smart auto-start logic
            const shouldAutoStart =
              this.isLecture &&
              !this.timerState?.isActive &&
              !this.hasStartedInitialTimer &&
              !this.userHasCancelled &&
              !this.userHasStopped;

            if (shouldAutoStart) {
              console.log("🎯 Smart auto-start: All conditions met");
              this.hasStartedInitialTimer = true;
              setTimeout(() => {
                this.startWorkTimer();
              }, 1000);
            } else if (this.timerState?.isActive && this.timerState?.isPaused) {
              console.log("▶️ Resuming paused timer (not starting new!)");
              await chrome.runtime.sendMessage({ type: "RESUME_TIMER" });
            } else if (
              this.timerState?.isActive &&
              !this.timerState?.isPaused
            ) {
              console.log("ℹ️ Timer already running, no action needed");
            } else {
              console.log(
                "ℹ️ Video play event, but conditions not met for timer action"
              );
              console.log("   - isLecture:", this.isLecture);
              console.log("   - timerActive:", !!this.timerState?.isActive);
              console.log("   - hasStarted:", this.hasStartedInitialTimer);
              console.log("   - userCancelled:", this.userHasCancelled);
              console.log("   - userStopped:", this.userHasStopped);
            }
          });

          this.video.addEventListener("pause", async (e) => {
            console.log("⏸️ Video pause event detected");

            await this.syncTimerState();

            if (
              !this.isTimerControlledPause &&
              this.timerState?.isActive &&
              !this.timerState?.isPaused
            ) {
              console.log("⏸️ Manual pause detected - pausing timer");
              await chrome.runtime.sendMessage({ type: "PAUSE_TIMER" });
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
      console.log("🎓 Starting lecture detection...");

      if (!this.lectureDetector) {
        console.warn("⚠️ LectureDetector not available");
        return;
      }

      let detection = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts && (!detection || detection.score === 0)) {
        if (attempts > 0) {
          console.log(`🔄 Lecture detection attempt ${attempts + 1}...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        detection = this.lectureDetector.detectLecture();
        attempts++;
      }

      if (!detection) return;

      this.isLecture = detection.isLecture;

      console.log("🎓 LECTURE DETECTION COMPLETE:");
      console.log(
        `   📊 Score: ${detection.score} (threshold: ${detection.threshold})`
      );
      console.log(`   📚 Is Lecture: ${this.isLecture ? "YES" : "NO"}`);

      await chrome.runtime.sendMessage({
        type: "LECTURE_DETECTED",
        isLecture: this.isLecture,
        score: detection.score,
        title: detection.title,
        factors: detection.factors,
      });

      // Only show notification if conditions are right
      if (
        this.isLecture &&
        !this.hasShownNotification &&
        !this.timerState?.isActive &&
        !this.userHasCancelled &&
        !this.userHasStopped
      ) {
        this.showLectureDetectedNotification();
      }
    } catch (error) {
      console.error("❌ Error in lecture detection:", error);
    }
  }

  showLectureDetectedNotification() {
    if (this.hasShownNotification) return;

    console.log("📚 Showing lecture notification with countdown...");

    const notification = document.createElement("div");
    notification.id = "pomodoro-lecture-notification";
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
    const countdownEl = document.getElementById("countdown");
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdownEl) countdownEl.textContent = countdown;

      if (countdown <= 0) {
        clearInterval(countdownInterval);
        if (document.getElementById("pomodoro-lecture-notification")) {
          console.log("⏰ Auto-start countdown finished");
          this.hasStartedInitialTimer = true;
          this.startWorkTimer();
          notification.remove();
        }
      }
    }, 1000);

    document.getElementById("start-now-btn")?.addEventListener("click", () => {
      clearInterval(countdownInterval);
      console.log("🚀 User manually started session");
      this.hasStartedInitialTimer = true;
      this.sessionWasManuallyStarted = true;
      this.startWorkTimer();
      notification.remove();
    });

    // FIXED: Track user cancellation
    document
      .getElementById("cancel-auto-btn")
      ?.addEventListener("click", () => {
        clearInterval(countdownInterval);
        console.log("🚫 User cancelled auto-start - disabling for this video");
        this.userHasCancelled = true; // Disable auto-start for this video
        this.autoStartEnabled = false;
        notification.remove();
      });

    document.getElementById("dismiss-btn")?.addEventListener("click", () => {
      clearInterval(countdownInterval);
      console.log("❌ User dismissed notification - disabling auto-start");
      this.userHasCancelled = true;
      notification.remove();
    });
  }

  showBreakEndChoice() {
    console.log("☕ Showing break end choice notification...");

    if (this.breakEndNotification) {
      this.breakEndNotification.remove();
    }

    this.breakEndNotification = document.createElement("div");
    this.breakEndNotification.id = "pomodoro-break-end-notification";
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

    let countdown = 15;
    const countdownEl = document.getElementById("break-countdown");
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdownEl) countdownEl.textContent = countdown;

      if (countdown <= 0) {
        clearInterval(countdownInterval);
        console.log(
          "⏰ Break end countdown finished - auto-starting new session"
        );
        this.startNewSessionAfterBreak();
        this.removeBreakEndNotification();
      }
    }, 1000);

    document
      .getElementById("start-new-session-btn")
      ?.addEventListener("click", () => {
        clearInterval(countdownInterval);
        console.log("🎯 User chose to start new session");
        this.startNewSessionAfterBreak();
        this.removeBreakEndNotification();
      });

    // FIXED: Track user stop decision
    document
      .getElementById("stop-pomodoro-btn")
      ?.addEventListener("click", () => {
        clearInterval(countdownInterval);
        console.log("⏹ User chose to stop pomodoro - setting stop flag");
        this.userHasStopped = true; // Disable auto-start for this video
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

  startNewSessionAfterBreak() {
    console.log("🎯 Starting new session after break...");
    this.resumeVideo();
    this.hideOverlay();

    setTimeout(() => {
      this.startWorkTimer();
    }, 1000);
  }

  stopPomodoroSessions() {
    console.log("⏹ Stopping all pomodoro sessions...");
    chrome.runtime.sendMessage({ type: "STOP_TIMER" });
    this.hideOverlay();
    this.hasStartedInitialTimer = false;
    this.showCompletionMessage();
  }

  showCompletionMessage() {
    const completionMsg = document.createElement("div");
    completionMsg.id = "pomodoro-completion-message";
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

    setTimeout(() => {
      if (completionMsg.parentNode) {
        completionMsg.remove();
      }
    }, 5000);
  }

  startWorkTimer() {
    console.log("🎯 startWorkTimer called");

    if (this.timerState?.isActive) {
      console.log("⚠️ Timer already active, not starting new one");
      return;
    }

    console.log("📤 Sending START_WORK_TIMER message...");

    chrome.runtime
      .sendMessage({ type: "START_WORK_TIMER" })
      .then(async (response) => {
        if (response?.success) {
          console.log("✅ Work timer started successfully");
          await this.syncTimerState();
          this.showOverlay("work");
        } else {
          console.error("❌ Failed to start timer:", response);
        }
      })
      .catch((error) => {
        console.error("❌ Error starting timer:", error);
      });
  }

  // MODIFY the showOverlay method to respect minimize state:
  showOverlay(mode) {
    console.log(
      `🎯 showOverlay called for ${mode}, isMinimized: ${this.isMinimized}`
    );

    // If currently minimized, show mini overlay instead
    if (this.isMinimized) {
      console.log("📱 Respecting minimize state - showing mini overlay");
      this.showMiniOverlay(mode);
      return;
    }

    console.log(`🎯 Showing full ${mode} overlay`);

    if (this.overlay) this.overlay.remove();
    if (this.miniOverlay) this.miniOverlay.remove();

    this.overlay = document.createElement("div");
    this.overlay.id = "pomodoro-overlay";
    this.overlay.className = `pomodoro-overlay pomodoro-${mode}`;

    let duration = mode === "work" ? "20:00" : "05:00";
    if (this.timerState?.remainingTime) {
      const minutes = Math.floor(this.timerState.remainingTime / 60000);
      const seconds = Math.floor(
        (this.timerState.remainingTime % 60000) / 1000
      );
      duration = `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    }

    const modeText = mode === "work" ? "🎯 Focus Time" : "☕ Break Time";

    this.overlay.innerHTML = `
    <div class="timer-display">
      <div class="mode-text">${modeText}</div>
      <div class="time-remaining">${duration}</div>
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
      </div>
      ${
        mode === "work"
          ? '<div class="session-info">Stay focused! 💪</div>'
          : ""
      }
      ${
        mode === "break"
          ? `
        <div class="break-actions">
          <div class="break-message">Enjoy your break! 🧘‍♀️</div>
          <div class="break-info">Next session will start automatically after break</div>
        </div>
      `
          : ""
      }
      <div class="overlay-controls">
        <button id="minimize-btn" class="control-btn" title="Minimize">−</button>
        <button id="move-btn" class="control-btn" title="Move Position">⋯</button>
        <button id="pause-resume-btn" class="control-btn" title="Pause/Resume">${
          this.timerState?.isPaused ? "▶️" : "⏸️"
        }</button>
        <button id="stop-timer-btn" class="control-btn stop-btn" title="Stop Session">⏹</button>
      </div>
    </div>
  `;

    this.injectCSS();
    document.body.appendChild(this.overlay);
    this.setupOverlayControls(mode);
    // DON'T reset isMinimized here - let user control it

    console.log("✅ Full overlay displayed");
  }

  // NEW: Show minimized timer
  showMiniOverlay(mode) {
    console.log("📱 Showing mini overlay for", mode);

    if (this.overlay) this.overlay.remove();
    if (this.miniOverlay) this.miniOverlay.remove();

    let duration = mode === "work" ? "20:00" : "05:00";
    if (this.timerState?.remainingTime) {
      const minutes = Math.floor(this.timerState.remainingTime / 60000);
      const seconds = Math.floor(
        (this.timerState.remainingTime % 60000) / 1000
      );
      duration = `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    }

    this.miniOverlay = document.createElement("div");
    this.miniOverlay.id = "pomodoro-mini-overlay";
    this.miniOverlay.className = `pomodoro-mini-overlay pomodoro-mini-${mode}`;
    this.miniOverlay.innerHTML = `
    <div class="mini-timer-content">
      <div class="mini-mode-icon">${mode === "work" ? "🎯" : "☕"}</div>
      <div class="mini-time">${duration}</div>
      <div class="mini-progress">
        <div class="mini-progress-fill"></div>
      </div>
    </div>
  `;

    this.injectCSS();
    document.body.appendChild(this.miniOverlay);
    this.isMinimized = true; // Ensure state is set

    // Click to expand
    this.miniOverlay.addEventListener("click", () => {
      console.log("📱 Mini overlay clicked - expanding to full view");
      this.isMinimized = false; // User explicitly chose to expand
      this.showOverlay(mode);
    });

    console.log("✅ Mini overlay displayed, minimize state preserved");
  }

  setupOverlayControls(mode) {
    document.getElementById("minimize-btn")?.addEventListener("click", () => {
      console.log("📱 Minimize button clicked - switching to mini view");
      this.isMinimized = true; // User explicitly chose to minimize
      this.showMiniOverlay(mode);
    });

    document.getElementById("move-btn")?.addEventListener("click", () => {
      this.cycleOverlayPosition();
    });

    document
      .getElementById("pause-resume-btn")
      ?.addEventListener("click", async () => {
        if (this.timerState?.isPaused) {
          await chrome.runtime.sendMessage({ type: "RESUME_TIMER" });
        } else {
          await chrome.runtime.sendMessage({ type: "PAUSE_TIMER" });
        }
        setTimeout(async () => {
          await this.syncTimerState();
          const btn = document.getElementById("pause-resume-btn");
          if (btn) btn.textContent = this.timerState?.isPaused ? "▶️" : "⏸️";
        }, 100);
      });

    document.getElementById("stop-timer-btn")?.addEventListener("click", () => {
      if (confirm("Stop current session?")) {
        console.log("⏹ User manually stopped session");
        this.userHasStopped = true;
        chrome.runtime.sendMessage({ type: "STOP_TIMER" });
        this.hideOverlay();
        this.hasStartedInitialTimer = false;
        // Reset minimize state when stopping
        this.isMinimized = false;
      }
    });
  }

  cycleOverlayPosition() {
    const positions = [
      { top: "20px", right: "20px", bottom: "auto", left: "auto" },
      { top: "20px", right: "auto", bottom: "auto", left: "20px" },
      { top: "auto", right: "20px", bottom: "20px", left: "auto" },
      { top: "auto", right: "auto", bottom: "20px", left: "20px" },
      {
        top: "50%",
        right: "auto",
        bottom: "auto",
        left: "20px",
        transform: "translateY(-50%)",
      },
    ];

    const currentPos = this.overlay.getAttribute("data-position") || "0";
    const nextPos = (parseInt(currentPos) + 1) % positions.length;

    const pos = positions[nextPos];
    Object.assign(this.overlay.style, pos);
    this.overlay.setAttribute("data-position", nextPos);

    console.log(`📍 Overlay moved to position ${nextPos + 1}`);
  }

  updateOverlay(remainingMs, mode, sessionCount = 0, isPaused = false) {
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    const timeDisplay = `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;

    // Update full overlay if visible
    if (this.overlay) {
      const timeElement = this.overlay.querySelector(".time-remaining");
      if (timeElement) {
        timeElement.textContent = timeDisplay;
        timeElement.style.opacity = isPaused ? "0.6" : "1";
      }

      const pauseBtn = this.overlay.querySelector("#pause-resume-btn");
      if (pauseBtn) {
        pauseBtn.textContent = isPaused ? "▶️" : "⏸️";
      }

      // Update progress
      const workDuration = 20 * 60 * 1000;
      const breakDuration = 5 * 60 * 1000;
      const totalDuration = mode === "work" ? workDuration : breakDuration;
      const progress = ((totalDuration - remainingMs) / totalDuration) * 100;

      const progressFill = this.overlay.querySelector(".progress-fill");
      if (progressFill) {
        progressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
      }

      if (mode === "work" && sessionCount > 0) {
        const sessionInfo = this.overlay.querySelector(".session-info");
        if (sessionInfo) {
          const status = isPaused ? "⏸️ Paused" : "💪 Stay focused!";
          sessionInfo.textContent = `Session ${sessionCount} - ${status}`;
        }
      }
    }

    // NEW: Update mini overlay if visible
    if (this.miniOverlay) {
      const miniTimeEl = this.miniOverlay.querySelector(".mini-time");
      if (miniTimeEl) {
        miniTimeEl.textContent = timeDisplay;
        miniTimeEl.style.opacity = isPaused ? "0.6" : "1";
      }

      // Update mini progress
      const workDuration = 20 * 60 * 1000;
      const breakDuration = 5 * 60 * 1000;
      const totalDuration = mode === "work" ? workDuration : breakDuration;
      const progress = ((totalDuration - remainingMs) / totalDuration) * 100;

      const miniProgressFill = this.miniOverlay.querySelector(
        ".mini-progress-fill"
      );
      if (miniProgressFill) {
        miniProgressFill.style.width = `${Math.max(
          0,
          Math.min(100, progress)
        )}%`;
      }

      // Add pause visual indicator
      if (isPaused) {
        this.miniOverlay.classList.add("paused");
      } else {
        this.miniOverlay.classList.remove("paused");
      }
    }
  }

  hideOverlay() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.miniOverlay) {
      this.miniOverlay.remove();
      this.miniOverlay = null;
    }
    this.isMinimized = false;
  }

  pauseVideo() {
    console.log("⏸️ Pausing video (timer-controlled)");
    this.isTimerControlledPause = true;

    if (this.videoController) {
      this.videoController.pauseVideo();
    } else if (this.video && !this.video.paused) {
      this.video.pause();
    }
  }

  resumeVideo() {
    console.log("▶️ Resuming video");

    if (this.videoController) {
      this.videoController.resumeVideo();
    } else if (this.video && this.video.paused) {
      const playPromise = this.video.play();
      if (playPromise) {
        playPromise.catch((error) => {
          console.log("Autoplay blocked, user needs to click play");
        });
      }
    }
  }

  async handleMessage(message, sender, sendResponse) {
    console.log("📨 Content script received:", message.type);

    switch (message.type) {
      case "TIMER_TICK":
        this.timerState = {
          isActive: true,
          mode: message.mode,
          remainingTime: message.remainingTime,
          sessionCount: message.sessionCount,
          isPaused: message.isPaused || false,
        };
        this.updateOverlay(
          message.remainingTime,
          message.mode,
          message.sessionCount,
          message.isPaused
        );
        break;

      case "WORK_TIMER_FINISHED":
        console.log("⏰ Work session complete - starting break");
        this.pauseVideo();
        this.startBreakTimer();
        break;

      case "BREAK_TIMER_FINISHED":
        console.log("☕ Break complete - showing choice notification");
        this.showBreakEndChoice();
        break;

      case "FORCE_RESUME":
        console.log("🔴 Force resume");
        this.resumeVideo();
        this.hideOverlay();
        this.hasStartedInitialTimer = false;
        break;

      case "MANUAL_LECTURE_TOGGLE":
        console.log("📚 Manual lecture toggle:", message.isLecture);
        this.isLecture = message.isLecture;

        if (message.isLecture) {
          this.lectureDetector.markAsLecture();
          // Reset user preferences for manual toggle
          this.userHasCancelled = false;
          this.userHasStopped = false;
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
    chrome.runtime
      .sendMessage({ type: "START_BREAK_TIMER" })
      .then(async (response) => {
        if (response?.success) {
          console.log("☕ Break timer started");
          await this.syncTimerState();

          // Respect current minimize state
          if (this.isMinimized) {
            console.log(
              "☕ Starting break timer in mini view (user preference)"
            );
            this.showMiniOverlay("break");
          } else {
            console.log("☕ Starting break timer in full view");
            this.showOverlay("break");
          }
        }
      });
  }
  injectCSS() {
    if (document.getElementById("pomodoro-css-injected")) return;

    const style = document.createElement("style");
    style.id = "pomodoro-css-injected";
    style.textContent = `
      /* Existing notification styles */
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

      /* NEW: Mini overlay styles */
      .pomodoro-mini-overlay {
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        background: rgba(0, 0, 0, 0.8) !important;
        backdrop-filter: blur(8px) !important;
        border-radius: 12px !important;
        padding: 8px 12px !important;
        z-index: 999999 !important;
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif !important;
        color: white !important;
        cursor: pointer !important;
        transition: all 0.3s ease !important;
        border: 2px solid rgba(255, 255, 255, 0.2) !important;
        animation: miniSlideIn 0.3s ease-out !important;
        min-width: 80px !important;
      }

      .pomodoro-mini-overlay:hover {
        transform: scale(1.05) !important;
        background: rgba(0, 0, 0, 0.9) !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
      }

      .pomodoro-mini-overlay.paused {
        opacity: 0.7 !important;
        animation: pulse 2s infinite !important;
      }

      .pomodoro-mini-work { border-left: 3px solid #4CAF50 !important; }
      .pomodoro-mini-break { border-left: 3px solid #FF9800 !important; }

      .mini-timer-content {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        font-size: 14px !important;
      }

      .mini-mode-icon {
        font-size: 16px !important;
        line-height: 1 !important;
      }

      .mini-time {
        font-weight: 700 !important;
        font-family: 'Monaco', monospace !important;
        font-size: 13px !important;
        transition: opacity 0.3s ease !important;
      }

      .mini-progress {
        position: absolute !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        height: 3px !important;
        background: rgba(255, 255, 255, 0.2) !important;
        border-radius: 0 0 10px 10px !important;
        overflow: hidden !important;
      }

      .mini-progress-fill {
        height: 100% !important;
        width: 0% !important;
        background: linear-gradient(90deg, #4CAF50, #45a049) !important;
        transition: width 0.5s ease !important;
      }

      /* Break end notification styles */
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

      /* Completion message */
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

      /* Full overlay styles */
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

      @keyframes miniSlideIn {
        from { transform: translateX(100%) scale(0.5); opacity: 0; }
        to { transform: translateX(0) scale(1); opacity: 1; }
      }

      @keyframes bounceIn {
        0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
        50% { transform: translate(-50%, -50%) scale(1.05); }
        70% { transform: translate(-50%, -50%) scale(0.9); }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }

      @keyframes pulse {
        0%, 100% { opacity: 0.7; }
        50% { opacity: 0.9; }
      }
    `;

    document.head.appendChild(style);
  }

  setupNavigationListener() {
    let currentUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        if (currentUrl.includes("/watch")) {
          console.log(
            "🔄 YouTube navigation - resetting ALL state including minimize"
          );

          this.hideOverlay();
          this.removeBreakEndNotification();
          this.isLecture = false;
          this.hasShownNotification = false;
          this.hasStartedInitialTimer = false;
          this.autoStartEnabled = true;

          // Reset user preferences AND minimize state on navigation
          this.userHasCancelled = false;
          this.userHasStopped = false;
          this.sessionWasManuallyStarted = false;
          this.isMinimized = false; // Reset minimize preference

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
console.log("🍅 Starting ULTIMATE YouTube Pomodoro Timer...");
new YouTubePomodoroTimer();
