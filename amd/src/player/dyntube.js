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
 * Dyntube Player class
 * Doc: https://www.dyntube.com/dev/javascript-events-methods/plain-javascript-events-and-methods
 * @module     mod_interactivevideo/player/dyntube
 * @copyright  2025 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import $ from 'jquery';
import {dispatchEvent} from 'core/event_dispatcher';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

let player = {};
class Dyntube {
    /**
     * Creates an instance of the Dyntube player.
     *
     * @constructor
     */
    constructor() {
        this.type = 'dyntube';
        this.frequency = 0.25;
        this.useAnimationFrame = false;
        this.support = {
            playbackrate: false,
            quality: false,
            password: false,
        };
        this.live = false; // Added flag for live video support
    }
    /**
     * Get information about the video
     * @param {string} url
     * @param {string} node
     * @return {Promise<Object>}
     */
    async getInfo(url, node) {
        this.node = node;
        let self = this;
        // URL: https://videos.dyntube.com/videos/rbUeUuHky0qQhOIbsPNrzQ
        // URL: https://videos.dyntube.com/iframes/rbUeUuHky0qQhOIbsPNrzQ
        let regex = /(?:https?:\/\/)?(?:videos\.dyntube\.com|dyntube\.com)\/(?:videos|iframes)\/([^/]+)/;
        var match = regex.exec(url);
        var videoId = match ? match[1] : null;
        this.videoId = videoId;

        url = `https://videos.dyntube.com/videos/${videoId}`;
        // Get oembed data.
        let oembedUrl = `https://videos.dyntube.com/oembed/oembed.json?url=${encodeURIComponent(url)}`;

        const getData = async() => {
            try {
                const data = await $.ajax({
                    url: oembedUrl,
                    type: 'GET',
                    dataType: 'json',
                });
                return data;
            } catch {
                return {error: true};
            }
        };

        let data = await getData();
        if (data.error) {
            dispatchEvent('iv:playerError', {error: data});
            return;
        }

        self.title = data.title;
        self.posterImage = data.thumbnail_url;
        self.aspectratio = data.width / data.height;
        self.duration = data.duration; // Duration in seconds.
        let $iframe = $(data.html);
        self.iframesrc = $iframe.attr('src');
        // Load the Dyntube API script.
        var tag = document.createElement('script');
        tag.src = "https://embed.dyntube.com/player/v1/player-1.0.3.js";
        tag.async = true;
        tag.as = "script";
        tag.rel = "preload";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        if ($(`#${node}`).length > 0) {
            $(`#${node}`).replaceWith(`
            <iframe id="${node}" allow="autoplay; fullscreen" frameborder="0"
             webkitallowfullscreen mozallowfullscreen allowfullscreen
              src="${self.iframesrc}"></iframe>`);
        }

        /**
         * Waits for the Dyntube API to be available before initializing the player.
         * @param {Function} resolve - The function to call when Dyntube is ready.
         */
        function waitForDyntube(resolve) {
            if (window.dyntube && window.dyntube.Player) {
                player[node] = new window.dyntube.Player(
                    document.querySelector(`#${node}`),
                );
                resolve();
            } else {
                window.requestAnimationFrame(() => waitForDyntube(resolve));
            }
        }

        await new Promise(waitForDyntube);

        // eslint-disable-next-line consistent-return
        return new Promise((resolve) => {
            player[node].on("ready", function() {
                resolve({
                    title: self.title,
                    duration: self.duration,
                    posterImage: self.posterImage,
                });
            });
        });
    }
    /**
     * Load the video
     * @param {string} url
     * @param {number} start
     * @param {number} end
     * @param {object} opts
     * @return {Promise<Boolean>}
     */
    async load(url, start, end, opts = {}) {
        const showControls = opts.showControls || false;
        const node = opts.node || 'player';
        this.node = node;

        // Hide the player first.
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked', {
                requireVideoBlock: !showControls,
            });
        }

        var self = this;

        this.start = start;
        this.end = end;

        // URL: https://videos.dyntube.com/videos/rbUeUuHky0qQhOIbsPNrzQ
        // URL: https://videos.dyntube.com/iframes/rbUeUuHky0qQhOIbsPNrzQ
        let regex = /(?:https?:\/\/)?(?:videos\.dyntube\.com|dyntube\.com)\/(?:videos|iframes)\/([^/]+)/;
        var match = regex.exec(url);
        var videoId = match ? match[1] : null;
        this.videoId = videoId;

        url = `https://videos.dyntube.com/videos/${videoId}`;
        // Get oembed data.
        let oembedUrl = `https://videos.dyntube.com/oembed/oembed.json?url=${encodeURIComponent(url)}`;

        const getData = async() => {
            try {
                const data = await $.ajax({
                    url: oembedUrl,
                    type: 'GET',
                    dataType: 'json',
                });
                return data;
            } catch {
                return {error: true};
            }
        };

        let data = await getData();
        if (data.error) {
            dispatchEvent('iv:playerError', {error: data});
            return;
        }

        self.title = data.title;
        self.posterImage = data.thumbnail_url;
        self.aspectratio = data.width / data.height;
        self.duration = data.duration; // Duration in seconds.
        let $iframe = $(data.html);
        self.iframesrc = $iframe.attr('src');

        // Load the Dyntube API script.
        var tag = document.createElement('script');
        tag.src = "https://embed.dyntube.com/player/v1/player-1.0.3.js";
        tag.async = true;
        tag.as = "script";
        tag.rel = "preload";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        $(`#${node}`).replaceWith(`
            <iframe id="${node}" allow="autoplay; fullscreen" frameborder="0"
             webkitallowfullscreen mozallowfullscreen allowfullscreen
              src="${self.iframesrc}?${showControls ? "" : "controls=hidden"}&start=${start}&end=${end}"></iframe>`);

        /**
         * Waits for the Dyntube API to be available before initializing the player.
         * @param {Function} resolve - The function to call when Dyntube is ready.
         */
        function waitForDyntube(resolve) {
            if (window.dyntube && window.dyntube.Player) {
                player[node] = new window.dyntube.Player(
                    document.querySelector(`#${node}`),
                );
                resolve();
            } else {
                window.requestAnimationFrame(() => waitForDyntube(resolve));
            }
        }

        await new Promise(waitForDyntube);

        player[node].on("ready", function() {
            player[node].play(); // We need to play the video to get the duration.
            self.currentTime = start || 0;
            self.paused = true;
            self.ended = false;
            self.volume = 1;
            end = end || self.duration;
            end = Number(end.toFixed(2));
            self.end = end;
            self.totaltime = self.duration;
            self.duration = self.end - self.start;

            dispatchEvent('iv:playerReady', null, document.getElementById(node));

            player[node].on("play", function() {
                self.paused = false;
                dispatchEvent('iv:playerPlay');
            });

            player[node].on("pause", function() {
                self.paused = true;
                dispatchEvent('iv:playerPaused');
            });

            player[node].on("volumechange", function(volumeLevel) {
                dispatchEvent('iv:playerVolumeChange', {volume: volumeLevel});
            });

            player[node].on("timeupdate", function(currentTime) {
                if (currentTime >= self.end) {
                    self.ended = true;
                    self.paused = true;
                    player[self.node].pause();
                    dispatchEvent('iv:playerEnded');
                    return;
                }
                if (currentTime < self.start) {
                    currentTime = Math.ceil(self.start);
                    self.seek(currentTime);
                }
                dispatchEvent('iv:playerPlaying');
                self.currentTime = currentTime;
            });

            player[node].on("ended", function() {
                self.ended = true;
                self.paused = true;
                dispatchEvent('iv:playerEnded');
            });
        });
    }
    /**
     * Play the video
     * @return {Void}
     */
    play() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].play();
        this.paused = false;
    }
    /**
     * Pause the video
     * @return {Void}
     */
    pause() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].pause();
        this.paused = true;
    }
    /**
     * Stop the video
     * @param {Number} starttime
     * @return {Void}
     */
    stop(starttime) {
        if (!player[this.node]) {
            return;
        }
        this.currentTime = starttime || this.start;
        player[this.node].pause();
    }
    /**
     * Seek the video to a specific time
     * @param {Number} time
     * @return {Promise<Boolean>}
     */
    async seek(time) {
        if (!player[this.node]) {
            return false;
        }
        if (time < this.start) {
            time = this.start;
        }
        if (time > this.end) {
            time = this.end;
        }
        dispatchEvent('iv:playerSeekStart', {time: this.currentTime});
        this.ended = false;
        player[this.node].seek(Number(time));
        this.currentTime = time;
        dispatchEvent('iv:playerSeek', {time});
        return true;
    }
    /**
     * Get the current time of the video
     * @return {Number}
     */
    getCurrentTime() {
        if (!player[this.node]) {
            return 0;
        }
        return this.currentTime || this.start;
    }
    /**
     * Get the duration of the video
     * @return {Number}
     */
    getDuration() {
        if (!player[this.node]) {
            return 0;
        }
        return this.duration;
    }
    /**
     * Check if the video is paused
     * @return {Boolean}
     */
    isPaused() {
        if (!player[this.node]) {
            return true;
        }
        return this.paused;
    }
    /**
     * Check if the video is playing
     * @return {Boolean}
     */
    isPlaying() {
        if (!player[this.node]) {
            return false;
        }
        return !this.paused;
    }
    /**
     * Check if the video is ended
     * @return {Boolean}
     */
    isEnded() {
        if (!player[this.node]) {
            return false;
        }
        return this.ended;
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
        if (!player[this.node]) {
            return;
        }
        player[this.node] = null;
        $(`#${this.node}`).remove();
        dispatchEvent('iv:playerDestroyed');
    }
    /**
     * Get the state of the player
     * @return {Number}
     */
    getState() {
        if (!player[this.node]) {
            return 0;
        }
        return this.paused ? 'paused' : 'playing';
    }
    /**
     * Set playback rate of the video
     * @param {Number} rate
     */
    setRate(rate) {
        if (!player[this.node]) {
            return 1;
        }
        return rate;
    }
    /**
     * Mute the video
     */
    mute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].mute();
        this.volume = 0;
        dispatchEvent('iv:playerVolumeChange', {volume: 0});
    }
    /**
     * Unmute the video
     */
    unMute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].unmute();
        player[this.node].setVolume(1.0);
        this.volume = 1;
        dispatchEvent('iv:playerVolumeChange', {volume: 1});
    }

    isMuted() {
        if (!player[this.node]) {
            return false;
        }
        return this.volume === 0;
    }
    /**
     * Get the original player object
     */
    originalPlayer() {
        return player[this.node];
    }

    /**
     * Set subtitle
     * @param {string} track language code
     */
    setCaption(track) {
        return track;
    }
}

export default Dyntube;