# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2025-01-14
### Fixed
- Dailymotion video and SoundCloud audio played from the start after ended.
- iv:playerReady fired twice for Wistia video when password-protected.
- Destroy method didn't work correctly on SoundCloud/Spotify.

### Updated
- Resize player iframe for SoundCloud/Spotify.
- Add player type to body class.
- Add a key icon to the poster image on the card if video is password-protected
- Only auto update the video end time if it is 0 or undefined.

## [1.0] - 2025-01-13 - First Stable
### Added
- Support for Panopto, Spotify, PeerTube, Kinescope, SproutVideo, Rutube, and Rumble (Site admin must select them in the site settings to enable them.)
- Support for different video visibility options including unlisted, private, and password protected (subject to video providers).
- New appearance setting: Square poster image. If your poster image is a square, check this option to display it nicely on the activity card.
- Tutorial video for each interaction type.
- Quality change, fast-forward and rewind buttons on editor timeline.
- Full Privacy API implementation.
- New placeholder columns in interactivevideo_items table: intg1, intg2 and intg3.
- New column in interactivevideo_completion: lastviewed for last watched timestamp.
- New site settings: defaulttheme, disablecustomtime and videosharinginstructions

### Fixed
- Column names "start" and "end" are reserved keywords in mySQL, Oracle, and postgreSQL. Changed to "starttime" and "endtime" respectively.
- Fixed SQL in backup API for postgreSQL support.
- Skipped segment at the end of the video prevents displaying end screen and onEnded event.
- "requiremintime" column not backed up.
- When "enabled video types" setting is set to html5video and videolink, the URL input on the mod_form is hidden.
- Endscreen is not shown on some occassion.
- Interactions repeatedly open if they are put too close to one another (e.g. 0.1s).
- Many minor fixes

### Updated
- Add title attribute to buttons for accessibility improvement
- Use "gradebookroles" for report. Previously, it was set to roleid=5.
- Update query for group report to include only users in "gradebookroles".
- Prevent autoplaying if start screen has content.
- Interaction drawer is removed when video is replayed.
- Save lastviewed time in interactivevideo_completion rather than browser's cache.
- On activity editing form, right-click on start time or end time to set the value to the current video time.
- On activity editing form, when changing the start time or end time, the video will seek to the specified timestamp.
- Update player scripts to ensure video state is updated (e.g. isEnded,isPaused,isPlaying) as quickly as possible.
- Ensure video is paused before launching interaction. Player must return isPaused = true or isPlaying = false;
- Performance/memory improvement on playback.
- Set component=mod_interactivevideo on H5P player to enable H5PIntegration.reportingIsEnabled.
- Change vimeo regex to allow more URL variations such as custom URL (e.g. vimeo.com/{username}/{customtext}).

## [RC0.2] - 2024-11-12
### Added
- Closed caption/subtitle for Vimeo, Dailymotion, and YouTube.
- Set video quality for Vimeo (only works with videos from PRO+).
- Bulk create interactive video activities by drag-n-dropping a CSV file on course page. CSV file must contain at least the videourl column.
- Support for left sidebar if plugin implements it. (hassidebar class to the body)
- New language (PT_BR) contributed by @eduardokraus

### Fixed
- If grade set to 0, update_grade method will create an endless loop until memory runs out.
- Dailymotion autoplay behavior.
- Other bugs fix.

### Update
- When saving progress, only update grade if grademax isn't 0 and gradeinstance exists.
- When video start and end time are incorrect for some reason (e.g. < 0, > duration, start >= end, end == 0), update start and end columns in the interactivevideo table on first access.
- Styling improvements.

## [RC0.1] - 2024-11-01

### First release