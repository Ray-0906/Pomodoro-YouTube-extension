// utils/lecture-detector.js - COMPLETELY FIXED VERSION

class LectureDetector {
  constructor() {
    // Enhanced educational keywords with better scoring
    this.lectureKeywords = [
      // Primary educational terms (high score)
      { word: 'lecture', weight: 4 },
      { word: 'tutorial', weight: 4 },
      { word: 'course', weight: 4 },
      { word: 'lesson', weight: 4 },
      { word: 'class', weight: 3 },
      { word: 'training', weight: 3 },
      { word: 'workshop', weight: 3 },
      { word: 'webinar', weight: 3 },
      { word: 'seminar', weight: 3 },

      // Educational context terms (medium score)
      { word: 'learn', weight: 4 },
      { word: 'teach', weight: 4 },
      { word: 'education', weight: 2 },
      { word: 'study', weight: 4 },
      { word: 'explain', weight: 2 },
      { word: 'guide', weight: 4 },
      { word: 'how to', weight: 2 },
      { word: 'introduction to', weight: 2 },

      // Academic terms (low score)
      { word: 'academic', weight: 1 },
      { word: 'university', weight: 1 },
      { word: 'college', weight: 1 },
      { word: 'school', weight: 1 },
      { word: 'professor', weight: 1 },
      { word: 'instructor', weight: 1 },
      { word: 'teacher', weight: 1 }
    ];

    // Known educational channels with exact matches
    this.educationalChannels = [
      { name: 'MIT OpenCourseWare', weight: 8 },
      { name: 'Khan Academy', weight: 8 },
      { name: 'Coursera', weight: 8 },
      { name: 'edX', weight: 8 },
      { name: 'TED-Ed', weight: 7 },
      { name: 'Crash Course', weight: 7 },
      { name: 'Academic Earth', weight: 7 },
      { name: 'Yale Courses', weight: 7 },
      { name: 'Stanford', weight: 6 },
      { name: 'Harvard', weight: 6 },
      { name: 'MIT', weight: 6 },
      { name: 'University', weight: 3 },
      { name: 'College', weight: 3 },
      { name: 'Academy', weight: 3 },
      { name: 'Educational', weight: 3 },
      { name: 'Learning', weight: 4 }
    ];

    // Educational subject keywords
    this.educationalSubjects = [
      { word: 'mathematics', weight: 4 },
      { word: 'math', weight: 4 },
      { word: 'calculus', weight: 3 },
      { word: 'algebra', weight: 3 },
      { word: 'geometry', weight: 3 },
      { word: 'physics', weight: 3 },
      { word: 'chemistry', weight: 3 },
      { word: 'biology', weight: 3 },
      { word: 'science', weight: 2 },
      { word: 'programming', weight: 6 },
      { word: 'computer science', weight: 6 },
      { word: 'coding', weight: 6 },
      { word: 'engineering', weight: 6 },
      { word: 'history', weight: 2 },
      { word: 'economics', weight: 2 },
      { word: 'psychology', weight: 2 },
      { word: 'philosophy', weight: 2 },
      { word: 'literature', weight: 2 },
      { word: 'statistics', weight: 3 },
      { word: 'data science', weight: 4 },
      { word: 'art', weight: 2 },
      { word: 'Notes', weight: 6 },
    ];

    console.log('🎓 LectureDetector initialized with enhanced scoring');
  }

  detectLecture() {
    console.log('🔍 Starting enhanced lecture detection...');

    // Get page elements with multiple fallback selectors
    const titleElement = this.findElement([
      'h1.title', 
      '.title', 
      '[class*="title"]', 
      'h1',
      '.ytp-title-link',
      '#container h1'
    ]);

    const channelElement = this.findElement([
      '#channel-name', 
      '.channel-name', 
      '[class*="channel"]',
      'a[href*="/channel/"]', 
      'a[href*="/@"]',
      '.ytd-channel-name a',
      '#owner-name a'
    ]);

    const descriptionElement = this.findElement([
      '#description', 
      '.description', 
      '[class*="description"]',
      '[class*="metadata"]',
      '#meta-contents',
      '.content.style-scope.ytd-video-secondary-info-renderer'
    ]);

    // Extract text content
    const title = this.extractText(titleElement);
    const channel = this.extractText(channelElement);
    const description = this.extractText(descriptionElement, 1000); // Limit to first 1000 chars

    console.log('📋 Extracted content:', { title: title?.substring(0, 100), channel, description: description?.substring(0, 100) });

    if (!title && !channel) {
      console.log('⚠️ No title or channel found - may be too early or page not loaded');
      return {
        isLecture: false,
        score: 0,
        title: '',
        channel: '',
        duration: 0,
        factors: ['No content found'],
        threshold: 8
      };
    }

    // Get video duration
    const duration = this.getVideoDuration();

    let score = 0;
    const factors = [];

    // Title analysis (most important factor)
    if (title) {
      const titleScore = this.analyzeText(title, this.lectureKeywords);
      if (titleScore > 0) {
        score += titleScore;
        factors.push(`Title keywords: +${titleScore} points`);
      }
    }

    // Channel analysis (very important)
    if (channel) {
      const channelScore = this.analyzeText(channel, this.educationalChannels);
      if (channelScore > 0) {
        score += channelScore;
        factors.push(`Educational channel: +${channelScore} points`);
      }
    }

    // Subject analysis in title
    if (title) {
      const subjectScore = this.analyzeText(title, this.educationalSubjects);
      if (subjectScore > 0) {
        score += subjectScore;
        factors.push(`Educational subjects: +${subjectScore} points`);
      }
    }

    // Duration analysis
    if (duration > 600) { // > 10 minutes
      score += 2;
      factors.push(`Long duration (${Math.round(duration/60)} min): +2 points`);
    }
    if (duration > 1800) { // > 30 minutes (very likely lecture)
      score += 3;
      factors.push('Very long duration (30+ min): +3 points');
    }

    // Description analysis (lower weight)
    if (description) {
      const descScore = Math.min(3, this.analyzeText(description, this.lectureKeywords));
      if (descScore > 0) {
        score += descScore;
        factors.push(`Description keywords: +${descScore} points`);
      }
    }

    // URL/Playlist analysis
    if (window.location.href.includes('list=')) {
      const playlistTitle = this.findElement(['.playlist-title', '[class*="playlist"]']);
      const playlistText = this.extractText(playlistTitle);
      if (playlistText) {
        const playlistScore = this.analyzeText(playlistText, this.lectureKeywords);
        if (playlistScore > 0) {
          score += Math.min(4, playlistScore);
          factors.push(`Educational playlist: +${Math.min(4, playlistScore)} points`);
        }
      }
    }

    // Check manual override
    const manualOverride = this.checkManualOverride();
    if (manualOverride !== null) {
      const isLecture = manualOverride;
      factors.push(`Manual override: ${isLecture ? 'marked as lecture' : 'marked as non-lecture'}`);

      return {
        isLecture,
        score: isLecture ? 999 : -999,
        title: title || '',
        channel: channel || '',
        duration,
        factors,
        threshold: 8,
        manualOverride: true
      };
    }

    // Decision threshold
    const threshold = 8;
    const isLecture = score >= threshold;

    const result = {
      isLecture,
      score,
      title: title || '',
      channel: channel || '',
      duration,
      factors,
      threshold
    };

    console.log('🎓 Lecture detection result:', result);

    return result;
  }

  findElement(selectors) {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          return element;
        }
      } catch (error) {
        // Invalid selector, continue to next
        continue;
      }
    }
    return null;
  }

  extractText(element, maxLength = null) {
    if (!element) return '';

    let text = '';

    // Try textContent first
    if (element.textContent) {
      text = element.textContent.trim();
    } else if (element.innerText) {
      text = element.innerText.trim();
    }

    if (maxLength && text.length > maxLength) {
      text = text.substring(0, maxLength);
    }

    return text;
  }

  analyzeText(text, keywords) {
    if (!text) return 0;

    const lowerText = text.toLowerCase();
    let score = 0;

    keywords.forEach(keyword => {
      const searchTerm = keyword.word || keyword.name || keyword;
      const weight = keyword.weight || 1;

      if (lowerText.includes(searchTerm.toLowerCase())) {
        score += weight;
      }
    });

    return score;
  }

  getVideoDuration() {
    try {
      // Try multiple selectors for duration
      const durationSelectors = [
        '.ytp-time-duration',
        '[class*="duration"]',
        '.video-duration',
        '.length-text'
      ];

      let durationText = '';

      for (const selector of durationSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
          durationText = element.textContent.trim();
          break;
        }
      }

      if (!durationText) {
        // Try to get from video element
        const video = document.querySelector('video');
        if (video && video.duration) {
          return video.duration;
        }
        return 0;
      }

      return this.parseDuration(durationText);
    } catch (error) {
      console.log('Could not determine video duration');
      return 0;
    }
  }

  parseDuration(durationText) {
    if (!durationText) return 0;

    // Remove any extra characters
    durationText = durationText.replace(/[^0-9:]/g, '');

    const parts = durationText.split(':').reverse();
    let seconds = 0;

    if (parts[0]) seconds += parseInt(parts[0]) || 0; // seconds
    if (parts[1]) seconds += (parseInt(parts[1]) || 0) * 60; // minutes
    if (parts[2]) seconds += (parseInt(parts[2]) || 0) * 3600; // hours

    return seconds;
  }

  // Manual override methods
  markAsLecture(videoUrl = window.location.href) {
    const overrides = JSON.parse(localStorage.getItem('pomodoro-lecture-overrides') || '{}');
    overrides[this.getVideoId(videoUrl)] = true;
    localStorage.setItem('pomodoro-lecture-overrides', JSON.stringify(overrides));
    console.log('✅ Video manually marked as lecture');
  }

  markAsNonLecture(videoUrl = window.location.href) {
    const overrides = JSON.parse(localStorage.getItem('pomodoro-lecture-overrides') || '{}');
    overrides[this.getVideoId(videoUrl)] = false;
    localStorage.setItem('pomodoro-lecture-overrides', JSON.stringify(overrides));
    console.log('❌ Video manually marked as non-lecture');
  }

  checkManualOverride(videoUrl = window.location.href) {
    const overrides = JSON.parse(localStorage.getItem('pomodoro-lecture-overrides') || '{}');
    return overrides[this.getVideoId(videoUrl)] || null;
  }

  getVideoId(url = window.location.href) {
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : url;
  }

  // Method to clear all overrides
  clearAllOverrides() {
    localStorage.removeItem('pomodoro-lecture-overrides');
    console.log('🗑️ All lecture overrides cleared');
  }
}