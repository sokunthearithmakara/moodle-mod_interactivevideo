
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
 * SoundCloud Player class
 *
 * @module     mod_interactivevideo/player/soundcloud
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

var player;
class SoundCloud {
    constructor() {
        this.type = 'soundcloud';
        this.frequency = 0.25;
        this.support = {
            playbackrate: false,
            quality: false,
            password: false,
        };
        this.useAnimationFrame = false;
    }
    /**
     * Creates an instance of the SoundCloud player.
     *
     * @param {string} url - The URL of the SoundCloud video.
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

        // Documented at https://developers.soundcloud.com/docs/api/html5-widget#parameters
        // e.g https://soundcloud.com/forss/flickermood
        let self = this;
        $('.video-block').remove();
        $('#annotation-canvas').removeClass('d-none');

        const getData = function() {
            return $.ajax({
                url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                type: 'POST',
                dataType: 'text',
                data: {
                    action: 'get_from_url',
                    contextid: M.cfg.contextid,
                    url: 'https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(url),
                    sesskey: M.cfg.sesskey,
                }
            });
        };
        const data = await getData();
        let json = JSON.parse(data);
        self.title = json.title;
        self.posterImage = json.thumbnail_url;
        self.aspectratio = 16 / 9;
        let ready = false;

        $(`#${node}`).replaceWith(json.html);
        $(`#video-wrapper`).find('iframe').attr({
            id: node,
            width: '100%',
            height: '100%',
            allow: 'autoplay; fullscreen;',
            allowfullscreen: 'true',
        });
        let SC;
        const callback = function() {
            SC = window.SC || SC;
            player = SC.Widget(node);
            self.player = player;
            player.bind(window.SC.Widget.Events.READY, function() {
                player.getDuration(function(duration) {
                    self.totaltime = Number((duration / 1000).toFixed(2));
                    self.end = end ? Math.min(end, self.totaltime) : self.totaltime;
                    self.currentTime = start;
                    self.ended = false;
                    self.player.seekTo(start * 1000);
                    self.player.pause();
                    ready = true;
                    dispatchEvent('iv:playerReady', null, document.getElementById(node));
                });
            });

            player.bind(window.SC.Widget.Events.PLAY_PROGRESS, function(data) {
                if (!ready) {
                    return;
                }

                let currentTime = data.currentPosition / 1000;
                self.currentTime = currentTime;
                if (self.paused) {
                    return;
                }
                if (!self.ended && currentTime >= self.end) {
                    self.ended = true;
                    dispatchEvent('iv:playerEnded');
                    return;
                }
                if (self.ended || self.currentTime < self.start) {
                    self.ended = false;
                    player.seekTo(self.start * 1000);
                }
                dispatchEvent('iv:playerPlaying');
            });

            player.bind(window.SC.Widget.Events.PLAY, function() {
                if (!ready) {
                    return;
                }
                self.paused = false;
            });

            player.bind(window.SC.Widget.Events.PAUSE, function() {
                if (!ready) {
                    return;
                }
                self.paused = true;
                if (self.ended) {
                    return;
                }
                dispatchEvent('iv:playerPaused');
            });

            player.bind(window.SC.Widget.Events.FINISH, function() {
                if (!ready) {
                    return;
                }
                self.ended = true;
                self.paused = true;
                dispatchEvent('iv:playerEnded');
            });

            player.bind(window.SC.Widget.Events.ERROR, function(data) {
                dispatchEvent('iv:playerError', {error: data});
            });
        };

        // Load the IFrame Player API code asynchronously.
        if (!window.SC) {
            var tag = document.createElement('script');
            tag.src = "https://w.soundcloud.com/player/api.js";
            tag.async = true;
            tag.type = 'text/javascript';
            var firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            // Replace the 'player' element with an <iframe> and SoundCloud player
            tag.onload = function() {
                SC = window.SC;
                callback();
            };
        } else {
            callback();
        }
    }
    /**
     * Play the video
     * @return {Void}
     */
    play() {
        this.player.play();
        this.paused = false;
    }
    /**
     * Pause the video
     * @return {Void}
     */
    pause() {
        this.player.pause();
        this.paused = true;
        return true;
    }
    /**
     * Stop the video
     * @param {Number} starttime
     * @return {Void}
     */
    stop(starttime) {
        this.player.seekTo(starttime * 1000);
        this.player.pause();
    }
    /**
     * Seek the video to a specific time
     * @param {Number} time
     * @return {Promise<Boolean>}
     */
    seek(time) {
        time = Math.min(time, this.end);
        time = Math.max(time, this.start);
        this.ended = false;
        return new Promise((resolve) => {
            this.player.seekTo(time * 1000);
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
        return new Promise((resolve) => {
            this.player.getPosition(function(position) {
                resolve(position / 1000);
            });
        });
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
        if (this.paused) {
            return true;
        }
        return new Promise((resolve) => {
            this.player.isPaused(function(paused) {
                resolve(paused);
            });
        });
    }
    /**
     * Check if the video is playing
     * @return {Boolean}
     */
    isPlaying() {
        if (this.paused) {
            return false;
        }
        return new Promise((resolve) => {
            this.player.isPaused(function(paused) {
                resolve(!paused);
            });
        });
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
        return 16 / 9; // SOUNDCLOUD always return 16:9 as of 2024.
    }
    /**
     * Destroy the player
     * @return {Void}
     */
    destroy() {
        try {
            this.player.pause();
            $(`#${this.node}`).remove();
            dispatchEvent('iv:playerDestroyed');
        } catch (e) {
            // Do nothing
        }
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
        this.player.setVolume(0);
    }
    /**
     * Unmute the video
     */
    unMute() {
        this.player.setVolume(100);
    }
    /**
     * Get the original player object
     */
    originalPlayer() {
        return player;
    }

    /**
     * Set subtitle
     */
    setCaption() {
        // SoundCloud does not support captions
    }
}

export default SoundCloud;