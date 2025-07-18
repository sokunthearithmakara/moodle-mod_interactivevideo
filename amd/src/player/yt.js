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
 * Youtube Player class
 * Documented at https://developers.google.com/youtube/iframe_api_reference
 *
 * @module     mod_interactivevideo/player/yt
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

let player = {};
class Yt {
    /**
     * Creates an instance of the YouTube player.
     *
     * @constructor
     */
    constructor() {
        this.useAnimationFrame = true;
        /**
         * The type of the player
         * @type {String}
         * @default yt
         * @private
         * @readonly
         */
        this.type = 'yt';
        /**
         * Interval frequency
         * @type {Number}
         */
        this.frequency = 0.25;
        this.support = {
            playbackrate: true,
            quality: false,
            password: true,
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
        return new Promise((resolve) => {
            var YT;
            let regex = new RegExp(
                '(?:https?:\\/\\/)?' +
                '(?:www\\.)?' +
                '(?:youtube\\.com|youtu\\.be|youtube-nocookie\\.com)' +
                '(?:\\/embed\\/|\\/watch\\?v=|\\/)([^\\/]+)',
                'g'
            );
            var match = regex.exec(url);
            var videoId = match[1];
            videoId = videoId.split("&")[0];
            var options = {
                videoId: videoId,
                width: 1080,
                height: 720,
                playerVars: {
                    autoplay: 0,
                    hl: M.cfg.language,
                    controls: 1,
                    showinfo: 0,
                    fs: 0,
                    "iv_load_policy": 3,
                    "cc_load_policy": 0,
                    autohide: 1,
                    rel: 0,
                    playsinline: 1,
                    disablekb: 0,
                },
                events: {
                    onReady: function(e) {
                        resolve({
                            title: e.target.videoTitle,
                            duration: e.target.getDuration(),
                            posterImage: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                        });
                    },
                }
            };
            if (!window.YT) {
                var tag = document.createElement('script');
                tag.src = "https://www.youtube.com/iframe_api";
                tag.async = true;
                tag.as = "script";
                tag.rel = "preload";
                var firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                // Replace the 'player' element with an <iframe> and YouTube player
                window.onYouTubeIframeAPIReady = function() {
                    YT = window.YT || {};
                    player[node] = new YT.Player(node, options);
                };
            } else {
                YT = window.YT || {};
                player[node] = new YT.Player(node, options);
            }
        });
    }
    /**
     * Load the video
     * @param {string} url
     * @param {number} start
     * @param {number} end
     * @param {object} opts
     * @param {boolean} reloaded
     * @return {Promise<Boolean>}
     */
    async load(url, start, end, opts = {}, reloaded = false) {
        const showControls = opts.showControls || false;
        const customStart = opts.customStart || false;
        const preload = opts.preload || false;
        const node = opts.node || 'player';
        this.node = node;

        // Hide the player first.
    //    $(`#video-wrapper`).addClass('invisible');
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked', {
                requireVideoBlock: true,
            });
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
        var YT;
        let regex = new RegExp(
            '(?:https?:\\/\\/)?' +
            '(?:www\\.)?' +
            '(?:youtube\\.com|youtu\\.be|youtube-nocookie\\.com)' +
            '(?:\\/embed\\/|\\/watch\\?v=|\\/)([^\\/]+)',
            'g'
        );
        var match = regex.exec(url);
        var videoId = match[1];
        videoId = videoId.split("&")[0];
        this.videoId = videoId;
        this.posterImage = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        // If the img size is 90x120, it means the maxresdefault.jpg is not available. So we use hqdefault.jpg instead.
        const img = new Image();
        img.src = this.posterImage;
        img.onload = () => {
            if (img.width == 120 && img.height == 90) {
                this.posterImage = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }
        };

        let loadedcaption = false;
        var ready = false;
        var self = this;
        let hasError = false;
        var options = {
            videoId: videoId,
            width: 1080,
            height: 720,
            playerVars: {
                autoplay: opts.autoplay || 0,
                hl: M.cfg.language,
                start: start,
                end: end,
                controls: showControls ? 1 : 0,
                showinfo: 0,
                fs: 0,
                "iv_load_policy": 3,
                "cc_load_policy": 0,
                autohide: 1,
                rel: 0,
                playsinline: 1,
                disablekb: opts.keyboard ? 0 : 1,
                mute: 1,
            },
            events: {
                onError: function(e) {
                    hasError = true;
                    dispatchEvent('iv:playerError', {error: e.data});
                },
                onReady: function(e) {
                    self.title = e.target.videoTitle;
                    // We don't want to use the end time from the player, just to avoid any issue restarting the video.
                    if (e.target.getDuration() <= 0 && e.target.videoTitle == '') {
                        dispatchEvent('iv:playerError', {error: 'Video not found'});
                        return;
                    }
                    let totaltime = Number(e.target.getDuration().toFixed(2)) - self.frequency;
                    if (e.target.getDuration() == 0) {
                        totaltime = 0.1;
                        self.live = true;
                    }
                    if (end == 0.1 && !self.live) {
                        end = totaltime;
                    }
                    end = !end ? totaltime : Math.min(end, totaltime);
                    end = Number(end.toFixed(2));
                    self.end = end;
                    self.totaltime = totaltime;
                    self.duration = self.end - self.start;
                    self.aspectratio = self.ratio();
                    // It's always good idea to play the video at the beginning to download some data.
                    // Otherwise, if user seek before start, they're gonna get blackscreen.
                    if (preload == true && customStart == false) { // For editing form
                        ready = true;
                        dispatchEvent('iv:playerReady', null, document.getElementById(node));
                        $(`#video-wrapper`).removeClass('invisible');
                    } else {
                        e.target.mute();
                        e.target.playVideo();
                        let count = 0;
                        let interval = setInterval(() => {
                            count++;
                            if (ready === true) {
                                clearInterval(interval);
                                e.target.pauseVideo();
                                e.target.unMute();
                                return;
                            }
                            if (e.target.getCurrentTime() > 0 || count > 6) {
                                clearInterval(interval);
                                if (hasError) {
                                    return;
                                }
                                if (self.live) {
                                    self.start = e.target.getCurrentTime();
                                    self.end = e.target.getCurrentTime() + 1;
                                }
                                e.target.seekTo(self.start);
                                e.target.pauseVideo();
                                e.target.unMute();
                                ready = true;
                                dispatchEvent('iv:playerReady', null, document.getElementById(node));
                                $(`#video-wrapper`).removeClass('invisible');
                            }
                        }, 1000);
                    }
                },

                onAutoplayBlocked: function(e) {
                    $(`.video-block, #video-block`).remove();
                    if (ready === false) {
                        e.target.unMute();
                        ready = true;
                        dispatchEvent('iv:playerReady', null, document.getElementById(node));
                        $(`#video-wrapper`).removeClass('invisible');
                    }
                },

                onStateChange: function(e) {
                    if (ready === false) {
                        return;
                    }
                    // For non-live videos, enforce start/end boundaries
                    if (!self.live) {
                        if (player[self.node].getCurrentTime() < self.start) {
                            player[self.node].seekTo(self.start);
                            player[self.node].playVideo();
                        }
                        if (player[self.node].getCurrentTime() >= self.end + self.frequency) {
                            player[self.node].seekTo(self.end - self.frequency);
                            player[self.node].playVideo();
                        }
                    }
                    switch (e.data) {
                        case YT.PlayerState.ENDED:
                            self.ended = true;
                            self.paused = true;
                            dispatchEvent('iv:playerEnded');
                            break;
                        case YT.PlayerState.PLAYING:
                            self.paused = false;
                            if (self.ended) {
                                self.ended = false;
                                if (player[self.node].getCurrentTime() < self.start) {
                                    player[self.node].seekTo(self.start);
                                } else if (player[self.node].getCurrentTime() >= self.end) {
                                    player[self.node].seekTo(self.start);
                                }
                            }
                            dispatchEvent('iv:playerPlay');
                            dispatchEvent('iv:playerPlaying');
                            if (!self.live && player[self.node].getCurrentTime() >= self.end) {
                                self.ended = true;
                                self.paused = true;
                                dispatchEvent('iv:playerEnded');
                            }
                            break;
                        case YT.PlayerState.PAUSED:
                            self.paused = true;
                            dispatchEvent('iv:playerPaused');
                            break;
                        case YT.PlayerState.CUED:
                            if (!self.live && player[self.node].getCurrentTime() >= self.end) {
                                player[self.node].seekTo(self.start);
                            }
                            break;
                    }
                },

                onPlaybackRateChange: function(e) {
                    dispatchEvent('iv:playerRateChange', {rate: e.data});
                },

                onApiChange: function() {
                    // Always load captions
                    if (!loadedcaption) {
                        player[self.node].loadModule('captions');
                        loadedcaption = true;
                    }
                    player[self.node].setOption('captions', 'track', {});

                    let tracks;
                    try {
                        tracks = player[self.node].getOption('captions', 'tracklist');
                    } catch (e) {
                        tracks = [];
                    }
                    if (tracks && tracks.length > 0) {
                        // Set the first track as active.
                        tracks = tracks.map((track) => {
                            return {
                                label: track.displayName,
                                code: track.languageCode,
                            };
                        });
                        self.captions = tracks;
                    }
                    loadedcaption = true;
                    dispatchEvent('iv:playerLoaded', {tracks, reloaded: reloaded});
                },
            }
        };

        if (url.includes('youtube-nocookie')) {
            options.host = 'https://www.youtube-nocookie.com';
        }
        // Load the IFrame Player API code asynchronously.
        if (!window.YT) {
            var tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            tag.async = true;
            tag.as = "script";
            tag.rel = "preload";
            var firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            // Replace the 'player' element with an <iframe> and YouTube player
            window.onYouTubeIframeAPIReady = function() {
                YT = window.YT || {};
                player[node] = new YT.Player(node, options);
            };
        } else {
            YT = window.YT || {};
            player[node] = new YT.Player(node, options);
        }
        return new Promise((resolve) => {
            resolve(true);
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
            return false;
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
        return player[this.node].getPlayerState() == window.YT.PlayerState.PAUSED;
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
        try {
            return player[this.node].getPlayerState() == window.YT.PlayerState.PLAYING;
        } catch (e) {
            return false;
        }
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
        return player[this.node].getPlayerState() == window.YT.PlayerState.ENDED || player[this.node].getCurrentTime() >= this.end;
    }
    /**
     * Get the aspect ratio of the video
     * @return {Number}
     */
    ratio() {
        return 16 / 9; // YT always return 16:9 as of 2024.
    }
    /**
     * Destroy the player
     * @return {Void}
     */
    destroy() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].destroy();
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
        return player[this.node].getPlayerState();
    }
    /**
     * Set playback rate of the video
     * @param {Number} rate
     */
    setRate(rate) {
        if (!player[this.node]) {
            return 1;
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
        player[this.node].mute();
        dispatchEvent('iv:playerVolumeChange', {volume: 0});
    }
    /**
     * Unmute the video
     */
    unMute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].unMute();
        player[this.node].setVolume(100);
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
        player[this.node].setOption('captions', 'track', track ? {languageCode: track} : {});
    }
}

export default Yt;