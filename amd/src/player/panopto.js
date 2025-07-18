/* eslint-disable no-undef */
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
 * Panopto Player class
 *
 * @module     mod_interactivevideo/player/panopto
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import {getString} from 'core/str';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

var player = {};
class Panopto {
    /**
     * Constructor of the Panopto player.
     */
    constructor() {
        this.useAnimationFrame = true;
        /**
         * The type of the player
         * @type {String}
         * @default panopto
         * @private
         * @readonly
         */
        this.type = 'panopto';
        /**
         * Interval frequency
         * @type {Number}
         */
        this.frequency = 0.25;
        this.support = {
            playbackrate: true,
            quality: false,
        };
    }

    async getInfo(url, node) {
        this.node = node;
        var EmbedApi;
        const matches = url.match(/^[^/]+:\/\/([^/]*panopto\.[^/]+)\/Panopto\/.+\?id=(.+)$/);
        const serverName = matches[1];
        const sessionId = matches[2];
        return new Promise((resolve) => {
            const launchSetup = function() {
                player[node].unmuteVideo();
                player[node].setVolume(1);
                let totaltime = Number(player[node].getDuration().toFixed(2));
                $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    type: 'POST',
                    dataType: 'text/plain',
                    data: {
                        action: 'get_from_url',
                        contextid: M.cfg.contextid,
                        url: url,
                        sesskey: M.cfg.sesskey,
                    },
                    complete: function(res) {
                        // Get title and poster image from the video.
                        let parser = new DOMParser();
                        let doc = parser.parseFromString(res.responseText, 'text/html');
                        let page = $(doc);
                        let title = page.find('meta[property="og:title"]').attr('content');
                        let poster = page.find('meta[property="og:image"]').attr('content');
                        resolve({
                            duration: totaltime,
                            title: title,
                            posterImage: poster,
                        });
                    }
                });
            };
            var options = {
                sessionId,
                serverName,
                width: 1080,
                height: 720,
                videoParams: {
                    interactivity: 'none',
                    showtitle: false,
                    autohide: true,
                    offerviewer: false,
                    autoplay: true,
                    showbrand: false,
                },
                events: {
                    onReady: function() { // When video is ready to play.
                        player[node].muteVideo();
                        player[node].pauseVideo();
                        launchSetup();
                    },
                }
            };

            if (!window.EmbedApi) {
                var tag = document.createElement('script');
                tag.src = "https://developers.panopto.com/scripts/embedapi.min.js";
                tag.type = 'text/javascript';
                var firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

                window.onPanoptoEmbedApiReady = function() {
                    EmbedApi = window.EmbedApi;
                    player[node] = new EmbedApi(node, options);
                };
            } else {
                player[node] = new window.EmbedApi(node, options);
            }
        });
    }

    /**
     * Creates an instance of the Panopto player.
     *
     * @constructor
     * @param {string} url - The URL of the Panopto video.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} end - The end time of the video in seconds.
     * @param {object} opts - The options for the player.
     * @param {boolean} reloaded
     */
    async load(url, start, end, opts = {}, reloaded = false) {
        let showControls = opts.showControls || false;
        const node = opts.node || 'player';
        this.node = node;
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked', {
                requireVideoBlock: true,
            });
            // ShowControls = true;
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

        // Documented at https://support.panopto.com/s/article/Learn-About-Panopto-Embed-API
        var EmbedApi;
        const matches = url.match(/^[^/]+:\/\/([^/]*panopto\.[^/]+)\/Panopto\/.+\?id=(.+)$/);
        const serverName = matches[1];
        const sessionId = matches[2];

        var ready = false;
        var self = this;
        self.aspectratio = 16 / 9;
        let autoplayBlocked = false;
        const launchSetup = function() {
            player[node].unmuteVideo();
            player[node].setVolume(1);
            let totaltime = Number(player[node].getDuration().toFixed(2)) - self.frequency;
            end = !end ? totaltime : Math.min(end, totaltime);
            end = Number(end.toFixed(2));
            self.end = end;
            self.totaltime = totaltime;
            self.duration = self.end - self.start;
            if (opts.editform) { // Get title and poster image from the video if it's in edit form.
                $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    type: 'POST',
                    dataType: 'text/plain',
                    data: {
                        action: 'get_from_url',
                        contextid: M.cfg.contextid,
                        url: url,
                        sesskey: M.cfg.sesskey,
                    },
                    complete: function(res) {
                        // Get title and poster image from the video.
                        let parser = new DOMParser();
                        let doc = parser.parseFromString(res.responseText, 'text/html');
                        let page = $(doc);
                        let title = page.find('meta[property="og:title"]').attr('content');
                        let poster = page.find('meta[property="og:image"]').attr('content');
                        self.title = title;
                        self.posterImage = poster;
                        if (!ready) {
                            ready = true;
                            if (!autoplayBlocked) {
                                autoplayBlocked = true;
                                dispatchEvent('iv:playerReady', null, document.getElementById(node));
                            }
                            if (!showControls) {
                                $('.video-block, #video-block').removeClass('no-pointer');
                            }
                        }
                    }
                });
            } else {
                let tracks = player[node].getCaptionTracks();
                player[node].disableCaptions();
                if (tracks && tracks.length > 0) {
                    tracks = tracks.map((track, i) => {
                        return {
                            label: track,
                            code: 'code-' + i,
                        };
                    });
                    dispatchEvent('iv:playerLoaded', {tracks, reloaded: reloaded});
                }
                if (!ready) {
                    ready = true;
                    if (!autoplayBlocked) {
                        autoplayBlocked = true;
                        dispatchEvent('iv:playerReady', null, document.getElementById(node));
                    }
                    if (!showControls) {
                        $('.video-block, #video-block').removeClass('no-pointer');
                    }
                }
            }
        };
        var options = {
            sessionId,
            serverName,
            width: 1080,
            height: 720,
            videoParams: {
                interactivity: 'none',
                showtitle: false,
                autohide: true,
                offerviewer: false,
                autoplay: true,
                showbrand: false,
                start: start,
                hideoverlay: !showControls,
            },
            events: {
                onReady: function() { // When video is ready to play.
                    // Do nothing.
                    if (!ready) {
                        player[node].muteVideo();
                        player[node].pauseVideo();
                        launchSetup();
                    }
                },
                onIframeReady: async function() { // Iframe is ready, but the video isn't ready yet. (e.g. blocked by the browser)
                    player[node].muteVideo();
                    player[node].loadVideo();
                    player[node].pauseVideo(); // If the autoplay is blocked by the browser, we'll get the error event. See onError.
                },
                onStateChange: function(state) {
                    if (ready === false) {
                        player[node].pauseVideo();
                        return;
                    }
                    switch (state) {
                        case PlayerState.Ended:
                            self.ended = true;
                            dispatchEvent('iv:playerEnded');
                            break;
                        case PlayerState.Playing:
                            if (player[node].getCurrentTime() >= self.end || player[node].getCurrentTime() < self.start) {
                                player[node].seekTo(self.start);
                            }
                            dispatchEvent('iv:playerPlay');
                            dispatchEvent('iv:playerPlaying');
                            self.ended = false;
                            this.paused = false;
                            break;
                        case PlayerState.Paused:
                            this.paused = true;
                            if (!self.ended && player[node].getCurrentTime() >= self.end - self.frequency) {
                                dispatchEvent('iv:playerEnded');
                                self.ended = true;
                                return;
                            }
                            dispatchEvent('iv:playerPaused');
                            self.ended = false;
                            break;
                    }
                },
                onPlaybackRateChange: function(e) {
                    dispatchEvent('iv:playerRateChange', {rate: e});
                },
                onError: async function(error) {
                    if (error === 'playNotAllowed') {
                        $('#start-screen #play').removeClass('d-none');
                        $('#start-screen #spinner').remove();
                        $('.video-block, #video-block').addClass('no-pointer bg-transparent');
                        // $('#start-screen').addClass('no-pointer');
                        $('#annotation-canvas').removeClass('d-none w-0');
                        if (opts.editform) {
                            if (!ready) {
                                const errorString = await getString('errorplaynotallowed', 'mod_interactivevideo');
                                $('#video-wrapper')
                                    .after(`<div class="noautoplay small text-danger mt-n3 mb-3">${errorString}</div>`);

                            }
                        } else {
                            if (!autoplayBlocked) {
                                autoplayBlocked = true;
                                dispatchEvent('iv:playerReady', null, document.getElementById(node));
                            }
                        }
                        return;
                    } else if (error === 'playWithSoundNotAllowed') {
                        if (!ready) {
                            player[node].muteVideo();
                        }
                        return;
                    }
                    dispatchEvent('iv:playerError', {error});
                },
                onLoginShown: function() {
                    $('#start-screen').addClass('d-none');
                    $('.video-block, #video-block').addClass('no-pointer bg-transparent');
                    $('#annotation-canvas').removeClass('d-none w-0');
                }
            }
        };

        if (!window.EmbedApi) {
            var tag = document.createElement('script');
            tag.src = "https://developers.panopto.com/scripts/embedapi.min.js";
            tag.type = 'text/javascript';
            var firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

            window.onPanoptoEmbedApiReady = function() {
                EmbedApi = window.EmbedApi;
                player[node] = new EmbedApi(node, options);
            };
        } else {
            player[node] = new window.EmbedApi(node, options);
        }
    }

    /**
     * Play the video
     * @return {Void}
     */
    play() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].playVideo();
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
        player[this.node].pauseVideo();
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
        player[this.node].seekTo(starttime);
        player[this.node].pauseVideo();
    }
    /**
     * Seek the video to a specific time
     * @param {Number} time
     * @return {Promise<Boolean>}
     */
    async seek(time) {
        if (!player[this.node]) {
            return time;
        }
        let currentTime = this.getCurrentTime();
        dispatchEvent('iv:playerSeekStart', {time: currentTime});
        this.ended = false;
        return new Promise((resolve) => {
            player[this.node].seekTo(time, true);
            dispatchEvent('iv:playerSeek', {time: time});
            resolve(true);
        });
    }
    /**
     * Get the current time of the video
     * @return {Number}
     */
    getCurrentTime() {
        if (!player[this.node]) {
            return 0;
        }
        return player[this.node].getCurrentTime();
    }
    /**
     * Get the duration of the video
     * @return {Number}
     */
    getDuration() {
        if (!player[this.node]) {
            return 0;
        }
        return player[this.node].getDuration();
    }
    /**
     * Check if the video is paused
     * @return {Boolean}
     */
    isPaused() {
        if (!player[this.node]) {
            return true;
        }
        if (this.paused) {
            return true;
        }
        return player[this.node].getState() == PlayerState.Paused;
    }
    /**
     * Check if the video is playing
     * @return {Boolean}
     */
    isPlaying() {
        if (!player[this.node]) {
            return false;
        }
        if (this.paused) {
            return false;
        }
        return player[this.node].getState() == PlayerState.Playing;
    }
    /**
     * Check if the video is ended
     * @return {Boolean}
     */
    isEnded() {
        if (!player[this.node]) {
            return false;
        }
        if (this.ended) {
            return true;
        }
        return player[this.node].getState() == PlayerState.Ended || player[this.node].getCurrentTime() >= this.end;
    }
    /**
     * Get the aspect ratio of the video
     * @return {Number}
     */
    ratio() {
        return 16 / 9; // PANOPTO always return 16:9 as of 2024.
    }
    /**
     * Destroy the player
     * @return {Void}
     */
    destroy() {
        $(`#${this.node}`).remove();
        player[this.node] = null;
        dispatchEvent('iv:playerDestroyed');
    }
    /**
     * Get the state of the player
     * @return {Number}
     */
    getState() {
        if (!player[this.node]) {
            return 'paused';
        }
        // eslint-disable-next-line no-nested-ternary
        return player[this.node].getState() === 1 ? 'playing' : player[this.node].getState() === 2 ? 'paused' : 'stopped';
    }
    /**
     * Set playback rate of the video
     * @param {Number} rate
     */
    setRate(rate) {
        if (!player[this.node]) {
            return rate;
        }
        player[this.node].setPlaybackRate(rate);
        return rate;
    }
    /**
     * Mute the video
     */
    mute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].muteVideo();
        dispatchEvent('iv:playerVolumeChange', {volume: 0});
    }
    /**
     * Unmute the video
     */
    unMute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].unmuteVideo();
        player[this.node].setVolume(1);
        dispatchEvent('iv:playerVolumeChange', {volume: 1});
    }

    isMuted() {
        if (!player[this.node]) {
            return false;
        }
        return player[this.node].isMuted();
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
        if (!player[this.node]) {
            return;
        }
        if (player[this.node].hasCaptions() === false) {
            return;
        }
        if (!track || track === '') {
            player[this.node].disableCaptions();
            return;
        }
        track = track.replace('code-', '');
        player[this.node].enableCaptions(track);
    }
}

export default Panopto;