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

var player;
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
    /**
     * Creates an instance of the Panopto player.
     *
     * @constructor
     * @param {string} url - The URL of the Panopto video.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} end - The end time of the video in seconds.
     * @param {object} opts - The options for the player.
     */
    async load(url, start, end, opts = {}) {
        let showControls = opts.showControls || false;
        const node = opts.node || 'player';
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
        const matches = url.match(/^[^\/]+:\/\/([^\/]*panopto\.[^\/]+)\/Panopto\/.+\?id=(.+)$/);
        const serverName = matches[1];
        const sessionId = matches[2];

        var ready = false;
        var self = this;
        self.aspectratio = 16 / 9;
        let autoplayBlocked = false;
        const launchSetup = function() {
            player.unmuteVideo();
            player.setVolume(1);
            let totaltime = Number(player.getDuration().toFixed(2)) - self.frequency;
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
                let tracks = player.getCaptionTracks();
                player.disableCaptions();
                if (tracks && tracks.length > 0) {
                    tracks = tracks.map((track, i) => {
                        return {
                            label: track,
                            code: 'code-' + i,
                        };
                    });
                    dispatchEvent('iv:playerLoaded', {tracks});
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
                        player.muteVideo();
                        player.pauseVideo();
                        launchSetup();
                    }
                },
                onIframeReady: async function() { // Iframe is ready, but the video isn't ready yet. (e.g. blocked by the browser)
                    player.muteVideo();
                    player.loadVideo();
                    player.pauseVideo(); // If the autoplay is blocked by the browser, we'll get the error event. See onError.
                },
                onStateChange: function(state) {
                    if (ready === false) {
                        player.pauseVideo();
                        return;
                    }
                    switch (state) {
                        case PlayerState.Ended:
                            self.ended = true;
                            dispatchEvent('iv:playerEnded');
                            break;
                        case PlayerState.Playing:
                            if (player.getCurrentTime() >= self.end || player.getCurrentTime() < self.start) {
                                player.seekTo(self.start);
                            }
                            dispatchEvent('iv:playerPlaying');
                            self.ended = false;
                            this.paused = false;
                            break;
                        case PlayerState.Paused:
                            this.paused = true;
                            if (!self.ended && player.getCurrentTime() >= self.end - self.frequency) {
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
                        $('#annotation-canvas').removeClass('d-none');
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
                            player.muteVideo();
                        }
                        return;
                    }
                    dispatchEvent('iv:playerError', {error});
                },
                onLoginShown: function() {
                    $('#start-screen').addClass('d-none');
                    $('.video-block, #video-block').addClass('no-pointer bg-transparent');
                    $('#annotation-canvas').removeClass('d-none');
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
                player = new EmbedApi(node, options);
            };
        } else {
            player = new window.EmbedApi(node, options);
        }
    }

    /**
     * Play the video
     * @return {Void}
     */
    play() {
        player.playVideo();
        this.paused = false;
    }
    /**
     * Pause the video
     * @return {Void}
     */
    pause() {
        player.pauseVideo();
        this.paused = true;
    }
    /**
     * Stop the video
     * @param {Number} starttime
     * @return {Void}
     */
    stop(starttime) {
        player.seekTo(starttime);
        player.pauseVideo();
    }
    /**
     * Seek the video to a specific time
     * @param {Number} time
     * @return {Promise<Boolean>}
     */
    async seek(time) {
        this.ended = false;
        return new Promise((resolve) => {
            player.seekTo(time, true);
            dispatchEvent('iv:playerSeek', {time: time});
            resolve(true);
        });
    }
    /**
     * Get the current time of the video
     * @return {Number}
     */
    getCurrentTime() {
        return player.getCurrentTime();
    }
    /**
     * Get the duration of the video
     * @return {Number}
     */
    getDuration() {
        return player.getDuration();
    }
    /**
     * Check if the video is paused
     * @return {Boolean}
     */
    isPaused() {
        if (this.paused) {
            return true;
        }
        return player.getState() == PlayerState.Paused;
    }
    /**
     * Check if the video is playing
     * @return {Boolean}
     */
    isPlaying() {
        if (this.paused) {
            return false;
        }
        return player.getState() == PlayerState.Playing;
    }
    /**
     * Check if the video is ended
     * @return {Boolean}
     */
    isEnded() {
        if (this.ended) {
            return true;
        }
        return player.getState() == PlayerState.Ended || player.getCurrentTime() >= this.end;
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
        player = null;
        $(`#player`).remove();
        dispatchEvent('iv:playerDestroyed');
    }
    /**
     * Get the state of the player
     * @return {Number}
     */
    getState() {
        return player.getState() === 1 ? 'playing' : player.getState() === 2 ? 'paused' : 'stopped';
    }
    /**
     * Set playback rate of the video
     * @param {Number} rate
     */
    setRate(rate) {
        player.setPlaybackRate(rate);
        return rate;
    }
    /**
     * Mute the video
     */
    mute() {
        player.muteVideo();
    }
    /**
     * Unmute the video
     */
    unMute() {
        player.unmuteVideo();
        player.setVolume(1);
    }
    /**
     * Get the original player object
     */
    originalPlayer() {
        return player;
    }

    /**
     * Set subtitle
     * @param {string} track language code
     */
    setCaption(track) {
        if (player.hasCaptions() === false) {
            return;
        }
        if (!track) {
            player.disableCaptions();
            return;
        }
        track = track.replace('code-', '');

        player.enableCaptions(track);
    }
}

export default Panopto;