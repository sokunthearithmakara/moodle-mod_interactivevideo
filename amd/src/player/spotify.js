
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Spotify Player class
 *
 * @module     mod_interactivevideo/player/spotify
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

class Spotify {
    constructor() {
        this.type = 'spotify';
        this.frequency = 1.2; // Spotify emits playback_update very very slowly (0.5 - 1 s).
        this.support = {
            playbackrate: false,
            quality: false,
            password: false,
        };
        this.useAnimationFrame = false;
        // Remove the mute button since Spotify does not support mute.
        $('#controller #mute').remove();
    }
    /**
     * Creates an instance of the Spotify player.
     *
     * @param {string} url - The URL of the Spotify video.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} end - The end time of the video in seconds.
     * @param {object} opts - The options for the player.
     */
    async load(url, start, end, opts = {}) {
        const node = opts.node || 'player';
        this.node = node;
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked');
        }
        /**
         * The start time of the video
         * @type {Number}
         * @private
         */
        this.start = start;
        /**
         * The end time of the video
         * @type {Number}
         */
        this.end = end;

        // Documented at https://developer.spotify.com/documentation/embeds/references/iframe-api
        // e.g https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5?si=8b1b1b1b1b1b1b1b
        let regex = /(?:https?:\/\/)?(?:open\.spotify\.com)\/(episode|track)\/([^/]+)/;
        let match = regex.exec(url);
        let videoId = match[2];
        let type = match[1];
        videoId = videoId.split("?")[0];
        this.videoId = videoId;
        let self = this;
        $('.video-block, #start-screen').remove();
        $('#annotation-canvas').removeClass('d-none');

        const getData = function() {
            return $.ajax({
                url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                type: 'POST',
                dataType: 'text',
                data: {
                    action: 'get_from_url',
                    contextid: M.cfg.contextid,
                    url: 'https://open.spotify.com/oembed?url=' + encodeURIComponent(url),
                    sesskey: M.cfg.sesskey,
                }
            });
        };

        if (opts.editform) {
            const data = await getData();
            try {
                var json = JSON.parse(data);
                self.title = json.title;
                self.posterImage = json.thumbnail_url;
            } catch (e) {
                self.title = '';
                self.posterImage = '';
            }
        }

        self.aspectratio = 16 / 9;
        let ready = false;
        self.ended = false;
        const callback = (EmbedController) => {
            window.EmbedController = EmbedController;
            EmbedController.on('ready', () => {
                $('#video-wrapper iframe').attr('id', node);
                EmbedController.seek(self.start);
                EmbedController.play();
            });
            EmbedController.addListener('playback_update', async e => {
                self.currentTime = e.data.position / 1000;
                if (!ready) {
                    let totaltime = e.data.duration / 1000;
                    totaltime = Number(totaltime.toFixed(2));

                    if (totaltime === 0) {
                        return;
                    }

                    if (totaltime < 40 && end > 40) { // Spotify shows the preview version of the audio if it cannot detect login.
                        // We don't want to play the preview version.
                        EmbedController.pause();
                        EmbedController.destroy();
                        dispatchEvent('iv:playerError', {message: 'The video is too short.'});
                        return;
                    }

                    if (e.data.position / 1000 < self.start) {
                        EmbedController.seek(self.start);
                        EmbedController.pause();
                        return;
                    }
                    EmbedController.resume();
                    totaltime = totaltime - self.frequency;
                    end = !end ? totaltime : Math.min(end, totaltime);
                    end = Number(end.toFixed(2));
                    self.end = end;
                    self.totaltime = totaltime;
                    self.duration = self.end - self.start;
                    ready = true;
                    dispatchEvent('iv:playerReady', null, document.getElementById(node));
                } else {

                    if (self.ended && e.data.isPaused === false) {
                        self.ended = false;
                        EmbedController.restart();
                        return;
                    }
                    if (self.currentTime < self.start) {
                        EmbedController.pause();
                        setTimeout(() => {
                            EmbedController.seek(self.start + self.frequency);
                            EmbedController.resume();
                        }, self.frequency);
                        return;
                    }
                    let isPaused = e.data.isPaused;
                    switch (isPaused) {
                        case true:
                            self.paused = true;
                            dispatchEvent('iv:playerPaused');
                            break;
                        case false:
                            self.paused = false;
                            dispatchEvent('iv:playerPlaying');
                            if (self.currentTime >= self.end - self.frequency) {
                                self.ended = true;
                                dispatchEvent('iv:playerEnded');
                            }
                            break;
                    }
                }
            });
        };

        // Load the IFrame Player API code asynchronously.
        const element = document.getElementById(node);
        const options = {
            uri: 'spotify:' + type + ':' + videoId,
            startAt: self.start,
        };
        if (!window.EmbedController) {
            var tag = document.createElement('script');
            tag.src = "https://open.spotify.com/embed/iframe-api/v1";
            tag.async = true;
            tag.type = 'text/javascript';
            var firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            // Replace the 'player' element with an <iframe> and Spotify player
            window.onSpotifyIframeApiReady = (IFrameAPI) => {
                IFrameAPI = window.IFrameAPI || IFrameAPI;
                window.IFrameAPI = IFrameAPI;
                IFrameAPI.createController(element, options, callback);
            };
        } else {
            window.IFrameAPI.createController(element, options, callback);
        }
    }
    /**
     * Play the video
     * @return {Void}
     */
    play() {
        window.EmbedController.resume();
        this.paused = false;
    }
    /**
     * Pause the video
     * @return {Void}
     */
    pause() {
        window.EmbedController.pause();
        this.paused = true;
        return true;
    }
    /**
     * Stop the video
     * @param {Number} starttime
     * @return {Void}
     */
    stop(starttime) {
        window.EmbedController.seek(starttime);
        window.EmbedController.pause();
    }
    /**
     * Seek the video to a specific time
     * @param {Number} time
     * @return {Promise<Boolean>}
     */
    seek(time) {
        this.ended = false;
        return new Promise((resolve) => {
            window.EmbedController.seek(time);
            this.currentTime = time;
            dispatchEvent('iv:playerSeek', {time: time});
            resolve(true);
        });
    }
    /**
     * Get the current time of the video
     * @return {Number}
     */
    getCurrentTime() {
        return this.currentTime;
    }
    /**
     * Get the duration of the video
     * @return {Number}
     */
    getDuration() {
        return this.totaltime;
    }
    /**
     * Check if the video is paused
     * @return {Boolean}
     */
    isPaused() {
        return this.paused;
    }
    /**
     * Check if the video is playing
     * @return {Boolean}
     */
    isPlaying() {
        return !this.paused;
    }
    /**
     * Check if the video is ended
     * @return {Boolean}
     */
    isEnded() {
        return this.ended || this.currentTime >= this.end;
    }
    /**
     * Get the aspect ratio of the video
     * @return {Number}
     */
    ratio() {
        return this.aspectratio;
    }
    /**
     * Destroy the player
     * @return {Void}
     */
    destroy() {
        window.EmbedController.destroy();
        dispatchEvent('iv:playerDestroyed');
    }
    /**
     * Get the state of the player
     * @return {Number}
     */
    getState() {
        return this.isPaused ? 'paused' : 'playing';
    }
    /**
     * Set playback rate of the video
     */
    setRate() {
        return false;
    }
    /**
     * Mute the video
     */
    mute() {
        // Spotify does not support mute
    }
    /**
     * Unmute the video
     */
    unMute() {
        // Spotify does not support mute
    }
    /**
     * Get the original player object
     */
    originalPlayer() {
        return window.EmbedController;
    }

    /**
     * Set subtitle
     */
    setCaption() {
        // Spotify does not support captions
    }
}

export default Spotify;