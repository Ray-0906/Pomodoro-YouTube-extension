# YouTube Pomodoro Timer Extension - Build Guide

## 🚀 Quick Setup Guide

### Prerequisites
- Google Chrome browser
- Basic understanding of Chrome extensions
- Text editor (VS Code recommended)

### File Structure
```
youtube-pomodoro-extension/
├── manifest.json              # Extension configuration
├── background.js              # Service worker (timer logic)
├── content.js                 # YouTube page integration
├── popup/
│   ├── popup.html            # Extension popup interface
│   ├── popup.css             # Popup styling
│   └── popup.js              # Popup functionality
├── utils/
│   ├── lecture-detector.js   # Educational content detection
│   └── video-control.js      # YouTube video controls
├── overlay/
│   └── overlay.css          # Timer overlay styling
└── assets/
    └── icons/               # Extension icons (16x16, 48x48, 128x128)
```

### Step-by-Step Installation

1. **Create Project Folder**
   ```bash
   mkdir youtube-pomodoro-extension
   cd youtube-pomodoro-extension
   ```

2. **Create Directory Structure**
   ```bash
   mkdir popup utils overlay assets assets/icons
   ```

3. **Add All Code Files**
   - Copy all the provided code files into their respective directories
   - Ensure file names match exactly as specified

4. **Add Extension Icons**
   - Create or download 16x16, 48x48, and 128x128 pixel PNG icons
   - Place them in `assets/icons/` as:
     - `icon-16.png`
     - `icon-48.png` 
     - `icon-128.png`

5. **Load Extension in Chrome**
   1. Open Chrome and go to `chrome://extensions/`
   2. Enable "Developer mode" (toggle in top right)
   3. Click "Load unpacked"
   4. Select your project folder
   5. The extension should now appear in your extensions list

### Testing Your Extension

1. **Navigate to YouTube**
   - Go to any YouTube video (preferably educational content)
   - The extension should automatically detect if it's a lecture

2. **Start a Focus Session**
   - Click the extension icon in the toolbar
   - Click "Start Focus Session"
   - A timer overlay should appear on the page

3. **Test Break Functionality**
   - Wait for the 20-minute timer to finish (or modify duration for testing)
   - Video should pause automatically
   - Break timer should start with option to force resume

### Debugging

1. **Check Console Logs**
   - Open Chrome DevTools (F12)
   - Check Console tab for any error messages
   - Look for messages like "YouTube Pomodoro Timer initialized"

2. **Extension Background Page**
   - Go to `chrome://extensions/`
   - Click "Details" on your extension
   - Click "Inspect views: background page"
   - Check console for background script errors

3. **Content Script Issues**
   - On YouTube pages, open DevTools
   - Check if content.js is loading properly
   - Look for lecture detection messages

### Common Issues & Solutions

**Issue**: Extension not loading
- **Solution**: Check manifest.json syntax, ensure all file paths are correct

**Issue**: Timer not starting
- **Solution**: Verify background.js is running, check permissions in manifest

**Issue**: Video not pausing
- **Solution**: Ensure content script is injecting properly, check video-control.js

**Issue**: Overlay not showing
- **Solution**: Check overlay.css is loading, verify CSS injection

### Customization Options

1. **Change Timer Durations**
   - Modify `WORK_DURATION` and `BREAK_DURATION` in background.js
   - Or use the settings panel in the popup

2. **Adjust Lecture Detection**
   - Edit keywords in `lecture-detector.js`
   - Modify scoring thresholds
   - Add more educational channels

3. **Customize Styling**
   - Edit `overlay.css` for timer appearance
   - Modify `popup.css` for extension popup styling

### Publishing to Chrome Web Store

1. **Prepare for Submission**
   - Create high-quality screenshots
   - Write detailed description
   - Test thoroughly across different YouTube videos
   - Ensure privacy policy compliance

2. **Web Store Requirements**
   - Developer account ($5 one-time fee)
   - Complete store listing with screenshots
   - Detailed privacy policy
   - Icon assets in required sizes

3. **Upload Process**
   - Zip your extension folder
   - Upload to Chrome Web Store Developer Dashboard
   - Fill out store listing details
   - Submit for review

### Advanced Features (Future Enhancements)

- **Statistics Dashboard**: Detailed analytics on focus patterns
- **Custom Themes**: Different timer overlay designs
- **Sync Across Devices**: Chrome storage sync
- **Keyboard Shortcuts**: Quick timer controls
- **Integration**: Calendar apps, note-taking tools
- **AI Enhancement**: Better lecture detection using ML

### Support & Contributing

For issues, feature requests, or contributions:
- Create detailed bug reports with steps to reproduce
- Include Chrome version and extension version
- Test on different YouTube video types
- Follow code style conventions

Happy focusing! 🍅📚
