# Changelog

All notable changes to this project will be documented in this file.

## [1.1.2] - 2025-03-01
https://mod-interactive-video.canny.io/changelog/interactive-video-v112

## [1.1.1] - 2025-02-15
### Fixed
- The action menu was hidden on the activity card in Moodle 4.1.
- Update thirdpartylibs.xml

## [1.1.0] - 2025-02-15
https://mod-interactive-video.canny.io/changelog/interactive-video-v11

## [1.0.3] - 2025-01-25
### Fixed
- Player didn't fire `ivplayerReady` event if the browser blocked autoplay.
- Share-moment link included `embed=1` if the link was created from the modal.
- `onPaused` method was not implemented on `beforeunload` event, resulting in the watched time not being saved.

### Updated
- Spotify player sometimes shows the preview version of the music tracks depending on the browser and user login. In this case, the interactions might be cut off. So, when the player is in preview mode, users will now get an error message before the player is destroyed.
- Kill all client-side background processes and event listener if the video is invisible and paused for 30 minutes on view page and 10 minutes on interactions page. If the video already ends, the processes will be killed after 5 minutes of inactivity.
- Get processed data from server only once for each interaction. Processed data will be saved to this.cache object with the annotation id. When the interaction is relaunched in the same session, the cached version will be used; therefore, releasing some burden from the server. This applies to view page only. One interaction page, a new data is fetched everytime the interaction is launched.
- Notify user if the browser blocks autoplay and encourage them to allow it on the current site.
- Kill the interactive video if on Brave browser with autoplay blocked. (We'll re-enable it in the future when Brave browser stops overly blocking the `play` method.)
- Improve ability for other plugins to extend the mod_form and completion conditions/states, and more importantly, make sure removing or disabling the related plugins does not caused any completion issues.
- Improve accuracy in calculting the time spent on interaction. For instance, resume counting when interaction is relaunched and pause counting when interaction is no longer active (e.g. activity closed or video playing).
- Right-click on timestamp on the interaction list to quick-edit the interaction's timestamp. Right-click on the input to set value to the current time.
- Minor accessiblity/UI/UX improvements

### Added
- Two url parameters to control the player appearance: `dm` for dark mode and `df` for distraction-free mode. Example: `https://yourmoodlesite.com/mod/interactivevideo/view.php?id=1&dm=1&df=1`;
- Allow extension plugins to include js methods on the mod_form. To enable this, the plugin must add an element on the mod_form with the class '.requirejs' and the data attribute `data-plugin` value as the amd module name. Example: `<div class="requirejs" data-plugin="local_ivanalytics/main"></div>`. The plugin must implement the method `mform` to add the required js code.
- `convertHMSToSeconds` in the base class to convert HH:MM:SS/MM:SS/SS to seconds.
- Ability to lock the top navigation when watching the video on a modal on the course page.
- `checkautoplay` to pre-check if the browser allows autoplay video on mute. Use `player.allowAutoplay` to check.
- New events: `interactionrefresh` (after the refresh button is clicked), `iv:autoplayBlocked` (as soon as the player method `load` runs.)
- `active` class to `#message` element of the current/visible interaction.

## [1.0.2] - 2025-01-17
### Fixed
- Custom start time for Spotify episode
- Timestamp column width is not respected on Safari.
- `Totaltime` is undefined in some circumstances.
- When the video restarts, the annotation that has `timestamp=starttime` is skipped.
- Individual completion record is not deleted from the report page on Moodle 4.1.
- Rumble's `isPlaying` method always returns true.

### Updated
- Improve error handling: remove/hide elements above the video to show the error screen (e.g. YouTube video no longer available)
- Only get `posterImage` and title when on editing form (`opts.editform`)
- If the video is already paused, do not pause again if not necessary.
- Reset `viewAnno` when the video restarts.
- Increase frequency for Spotify and PeerTube since their time update interval is longer than others.
- PeerTube: use `playbackStatusChange` to check/dispatch the pause state.
- PeerTube: ensure video resets to start time before dispatching `iv:playerReady`.
- Wistia: get annotation data from the database only after the password is validated.

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