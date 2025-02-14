/* eslint-disable */
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
 * Rutube Player class
 *
 * @module     mod_interactivevideo/player/rutube
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

let player;

class Rutube {
    /**
     * Constructs a Rutube player instance.
     */
    constructor() {
        this.type = 'rutube';
        this.useAnimationFrame = true;
        this.frequency = 0.25;
        this.support = {
            playbackrate: false,
            quality: false,
            password: false,
        };
    }
    /**
     * Load a Rutube player instance.
     * Documented at https://rutube.ru/info/embed
     *
     * @param {string} url - The URL of the Rutube video.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} end - The end time of the video in seconds.
     * @param {object} opts - The options for the player.
     */
    async load(url, start, end, opts = {}) {
        const showControls = opts.showControls || false;
        const node = opts.node || 'player';
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked');
        }
        this.start = start;
        this.aspectratio = 16 / 9;
        // Sample video: https://rutube.ru/video/9235cf652dcb9d29fb02f3f6692d2a47
        // Private video: https://rutube.ru/video/private/9235cf652dcb9d29fb02f3f6692d2a47/?p=sdf234234234
        const regex = /https:\/\/rutube\.ru\/video\/(?:private\/)?(.+)/;
        let match = regex.exec(url);
        let videoId = match[1];
        // Get the value of the private key url parameter.
        let privateKey = '';
        let keys = url.split('/?p=');
        if (keys.length > 1) {
            privateKey = keys[1];
            privateKey = privateKey.split('&')[0];
        }
        videoId = videoId.split("?")[0];
        this.videoId = videoId;
        let ready = false;
        let self = this;
        let started = false;
        $.ajax({
            url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
            type: 'POST',
            data: {
                action: 'get_from_url',
                contextid: M.cfg.contextid,
                url: `https://rutube.ru/api/play/options/${videoId}${privateKey != '' ? `?p=${privateKey}` : ''}`,
                sesskey: M.cfg.sesskey,
            },
        }).done(function(data) {
            if (data.html === undefined) {
                dispatchEvent('iv:playerError', {error: data});
            }
            self.posterImage = data.thumbnail_url;
            let totaltime = data.duration / 1000 - self.frequency;
            end = !end ? totaltime : Math.min(end, totaltime);
            end = Number(end.toFixed(2));
            self.end = end;
            self.totaltime = Number(totaltime.toFixed(2));
            self.duration = self.end - self.start;
            self.currentTime = self.start;
            let html = $(data.html);
            self.aspectratio = html.attr('width') / html.attr('height');
            self.title = data.title;
            let iframeurl = `https://rutube.ru/play/embed/${videoId}${privateKey != '' ? `?p=${privateKey}` : ''}`;
            $(`#${node}`).replaceWith(`<iframe id="player" src="${iframeurl}" frameBorder="0" allow="clipboard-write; autoplay"
                 webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>`);

            player = document.getElementById('player');
            self.player = player;

            window.addEventListener('message', function(event) {
                var message = '';
                try {
                    message = JSON.parse(event.data);
                } catch (e) {
                    return;
                }
                switch (message.type) {
                    case 'player:changeState':
                        if (message.data.state === 'playing') {
                            let currentTime = self.currentTime;
                            if (currentTime < self.start) {
                                self.seek(self.start);
                                self.ended = false;
                                self.paused = false;
                                dispatchEvent('iv:playerPlaying');
                                return;
                            }
                            if (!self.ended && currentTime >= self.end) {
                                self.ended = true;
                                self.paused = true;
                                dispatchEvent('iv:playerEnded');
                                return;
                            }
                            self.paused = false;
                            self.ended = false;
                            dispatchEvent('iv:playerPlaying');
                        } else if (message.data.state === 'paused') {
                            self.paused = true;
                            dispatchEvent('iv:playerPaused');
                        } else if (message.data.state === 'ended' || message.data.state === 'stopped') {
                            self.ended = true;
                            self.paused = true;
                            dispatchEvent('iv:playerEnded');
                        }
                        break;
                    case 'player:ready':
                        dispatchEvent('iv:playerReady', null, document.getElementById(node));
                        break;
                    case 'player:currentTime':
                        self.currentTime = message.data.time;
                        if (self.currentTime < self.start) {
                            self.currentTime = self.start;
                            self.seek(self.start);
                        }
                        if (self.currentTime > self.end + self.frequency) {
                            self.seek(self.end - self.frequency);
                        }
                        if (self.state === 'paused') {
                            dispatchEvent('iv:playerSeek', {time: self.currentTime});
                        }
                        break;
                    case 'player:rollState':
                        if (message.data.state === 'play') { // Ad started
                            $(".video-block, #video-block").addClass('d-none');
                            $("#start-screen").addClass('bg-transparent d-none');
                            $('#annotation-canvas').removeClass('d-none');
                        } else if (message.data.state === 'complete') { // Ad complete/error
                            $(".video-block, #video-block").removeClass('d-none');
                            $("#start-screen").removeClass('bg-transparent d-none');
                        }
                        break;
                    case 'player:error':
                        dispatchEvent('iv:playerError', {error: message.data});
                        break;
                };
            });
        }).catch(function(error) {
            dispatchEvent('iv:playerError', {error: error});
        });
    }
    doCommand(commandJSON) {
        return player.contentWindow.postMessage(JSON.stringify(commandJSON), '*');
    }
    /**
     * Plays the video using the Rutube player instance.
     * If the player is not initialized, logs an error to the console.
     */
    play() {
        this.doCommand({type: 'player:play', data: {}});
        this.paused = false;
    }
    /**
     * Pauses the Rutube player.
     *
     * This method calls the `pause` function on the `player` object to pause the video playback.
     */
    async pause() {
        await this.doCommand({type: 'player:pause', data: {}});
        this.paused = true;
        return true;
    }
    /**
     * Stops the video playback and sets the current time to the specified start time.
     *
     * @param {number} starttime - The time in seconds to which the video should be set before pausing.
     */
    stop(starttime) {
        this.doCommand({type: 'player:stop', data: {}});
    }
    /**
     * Seeks the video to a specified time.
     *
     * @param {number} time - The time in seconds to seek to.
     * @returns {Promise<number>} A promise that resolves to the time in seconds to which the video was seeked.
     */
    seek(time) {
        if (time < 0) {
            time = 0;
        }
        this.ended = false;
        this.doCommand({type: 'player:setCurrentTime', data: {time}});
        dispatchEvent('iv:playerSeek', {time: time});
        return time;
    }
    /**
     * Retrieves the current playback time of the video.
     *
     * @returns {Promise<number>} A promise that resolves to the current time in seconds.
     */
    getCurrentTime() {
        return this.currentTime;
    }
    /**
     * Asynchronously retrieves the duration of the video.
     *
     * @returns {Promise<number>} A promise that resolves to the duration of the video in seconds.
     */
    getDuration() {
        let duration = this.totaltime;
        return duration;
    }
    /**
     * Checks if the Rutube player is paused.
     *
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the player is paused.
     */
    isPaused() {
        return this.paused;
    }
    /**
     * Checks if the Rutube player is currently playing.
     *
     * @returns {Promise<boolean>} A promise that resolves to `true` if the player is playing, otherwise `false`.
     */
    isPlaying() {
        return !this.paused;
    }
    /**
     * Checks if the Rutube player has ended.
     *
     * @function isEnded
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the player has ended.
     */
    isEnded() {
        return this.ended || this.currentTime >= this.end;
    }
    /**
     * Calculates the aspect ratio of the video.
     * If the video's aspect ratio is greater than 16:9, it returns the actual aspect ratio.
     * Otherwise, it returns the 16:9 aspect ratio.
     *
     * @returns {Promise<number>} The aspect ratio of the video.
     */
    ratio() {
        return this.aspectratio;
    }
    /**
     * Destroys the Rutube player instance if it is initialized.
     * If the player is not initialized, logs an error message to the console.
     */
    destroy() {
        $(this.player).remove();
    }
    /**
     * Asynchronously retrieves the current state of the video player.
     *
     * @returns {Promise<string>} A promise that resolves to a string indicating the player's state, either 'paused' or 'playing'.
     */
    async getState() {
        const paused = await player.isPaused();
        return paused ? 'paused' : 'playing';
    }
    /**
     * Sets the playback rate for the Rutube player.
     *
     * @param {number} rate - The desired playback rate.
     *                        This should be a value supported by the Rutube player.
     */
    setRate(rate) {
        player.setPlaybackRate(rate);
    }
    /**
     * Mutes the Rutube player by setting the volume to 0.
     */
    mute() {
        this.doCommand({type: 'player:mute', data: {}});
    }
    /**
     * Unmutes the Rutube player by setting the volume to 1.
     */
    unMute() {
        this.doCommand({type: 'player:unMute', data: {}});
        this.doCommand({type: 'player:setVolume', data: {volume: 1}});
    }

    /**
     * Set quality of the video (NOT IMPLEMENTED)
     * @param {String} quality
     */
    async setQuality(quality) {
        return false;
    }
    /**
     * Get the available qualities of the video (NOT IMPLEMENTED)
     */
    async getQualities() {
        return [];
    }

    /**
     * Set subtitle of the video (NOT IMPLEMENTED)
     *  @param {String} language
     */
    async setCaption(language) {
        return false;
    }

    /**
     * Returns the original Rutube player instance.
     *
     * @returns {Object} The Rutube player instance.
     */
    originalPlayer() {
        return player;
    }
}

export default Rutube;