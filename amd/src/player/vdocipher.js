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
 * VdoCipher Player class
 * Doc: https://www.vdocipher.com/docs/player/v2/
 * @module     mod_interactivevideo/player/vdocipher
 * @copyright  2025 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import $ from 'jquery';
import {dispatchEvent} from 'core/event_dispatcher';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

let player = {};
class VdoCipher {
    /**
     * Creates an instance of the Dyntube player.
     *
     * @constructor
     */
    constructor() {
        this.type = 'vdocipher';
        this.frequency = 0.25;
        this.useAnimationFrame = false;
        this.support = {
            playbackrate: true,
            quality: true,
            password: false,
        };
        this.live = false; // Added flag for live video support
    }
    /**
     * Get information about the video
     * @param {string} url
     * @param {string} node
     * @return {Promise<Object>} A promise that resolves to an object containing information about the video.
     */
    async getInfo(url, node) {
        this.node = node;
        let self = this;

        url = url.split('|')[0];

        let regex = /(?:https?:\/\/)?(?:www\.)?vdocipher\.com\/dashboard\/video\/(?:embed\/|)([a-zA-Z0-9_-]+)/i;
        var match = regex.exec(url);
        var videoId = match ? match[1] : null;
        this.videoId = videoId;

        const getData = async() => {
            const data = await $.ajax({
                url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                type: 'POST',
                dataType: 'text',
                data: {
                    action: 'get_vdocipher',
                    sesskey: M.cfg.sesskey,
                    videoid: videoId,
                    contextid: M.cfg.contextid,
                    info: 'otp',
                },
            });
            return data;
        };

        let data = await getData();
        try {
            data = JSON.parse(data);
        } catch {
            data = {error: true};
        }

        if (data.error) {
            dispatchEvent('iv:playerError', {error: data});
            return;
        }

        self.otp = data.otp;
        self.playbackInfo = data.playbackInfo;

        // Get video info.
        const getVideoInfo = async() => {
            const data = await $.ajax({
                url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                type: 'POST',
                dataType: 'text',
                data: {
                    action: 'get_vdocipher',
                    sesskey: M.cfg.sesskey,
                    videoid: videoId,
                    contextid: M.cfg.contextid,
                    info: 'info',
                },
            });
            return data;
        };

        let info = await getVideoInfo();
        try {
            info = JSON.parse(info);
        } catch {
            info = {error: true};
        }
        if (info.error) {
            dispatchEvent('iv:playerError', {error: info});
            return;
        }
        self.title = info.title;
        self.posterImage = info.posters[0] ? info.posters[0].posterUrl : info.poster;
        self.aspectratio = info.posters[0].width / info.posters[0].height;
        self.duration = info.length; // Duration in seconds.
        self.iframesrc = `https://player.vdocipher.com/v2/?otp=${self.otp}&playbackInfo=${self.playbackInfo}`;
        // Load the Dyntube API script.
        var tag = document.createElement('script');
        tag.src = "https://player.vdocipher.com/v2/api.js";
        tag.async = true;
        tag.as = "script";
        tag.rel = "preload";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        $(`#${node}`).replaceWith(`
            <iframe id="${node}"
            src="${self.iframesrc}`
            + `&controls=on"
             frameborder=0 allowFullScreen="true" allow="encrypted-media"></iframe>`);

        let iframe = document.getElementById(node);
        /**
         * Waits for the Dyntube API to be available before initializing the player.
         * @param {Function} resolve - The function to call when Dyntube is ready.
         */
        function waitForVdoPlayer(resolve) {
            if (window.VdoPlayer) {
                player[node] = window.VdoPlayer.getInstance(iframe);
                resolve();
            } else {
                window.requestAnimationFrame(() => waitForVdoPlayer(resolve));
            }
        }

        await new Promise(waitForVdoPlayer);

        // eslint-disable-next-line consistent-return
        return new Promise((resolve) => {
            player[node].video.addEventListener('loadedmetadata', async function() {
                resolve({
                    duration: self.duration,
                    title: self.title,
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
     * @param {boolean} reloaded
     * @return {Promise<Boolean>}
     */
    async load(url, start, end, opts = {}, reloaded = false) {
        const showControls = opts.showControls || false;
        const node = opts.node || 'player';
        this.node = node;
        this.url = url;
        // Hide the player first.
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked', {
                requireVideoBlock: true,
            });
        }

        var self = this;
        this.start = start;
        this.end = end;

        // URL: https://www.vdocipher.com/dashboard/video/{videoId}/tab/settings
        // URL: https://www.vdocipher.com/dashboard/video/embed/{videoId}
        if (opts.editform) {
            url = url.split('|')[0];

            let regex = /(?:https?:\/\/)?(?:www\.)?vdocipher\.com\/dashboard\/video\/(?:embed\/|)([a-zA-Z0-9_-]+)/i;
            var match = regex.exec(url);
            var videoId = match ? match[1] : null;
            this.videoId = videoId;

            const getData = async() => {
                const data = await $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    type: 'POST',
                    dataType: 'text',
                    data: {
                        action: 'get_vdocipher',
                        sesskey: M.cfg.sesskey,
                        videoid: videoId,
                        contextid: M.cfg.contextid,
                        info: 'otp',
                    },
                });
                return data;
            };

            let data = await getData();
            try {
                data = JSON.parse(data);
            } catch {
                data = {error: true};
            }

            if (data.error) {
                dispatchEvent('iv:playerError', {error: data});
                return;
            }

            self.otp = data.otp;
            self.playbackInfo = data.playbackInfo;

            // Get video info.
            const getVideoInfo = async() => {
                const data = await $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    type: 'POST',
                    dataType: 'text',
                    data: {
                        action: 'get_vdocipher',
                        sesskey: M.cfg.sesskey,
                        videoid: videoId,
                        contextid: M.cfg.contextid,
                        info: 'info',
                    },
                });
                return data;
            };

            let info = await getVideoInfo();
            try {
                info = JSON.parse(info);
            } catch {
                info = {error: true};
            }
            if (info.error) {
                dispatchEvent('iv:playerError', {error: info});
                return;
            }
            self.title = info.title;
            self.posterImage = info.posters[0] ? info.posters[0].posterUrl : info.poster;
            self.aspectratio = info.posters[0].width / info.posters[0].height;
            self.duration = info.length; // Duration in seconds.
            self.iframesrc = `https://player.vdocipher.com/v2/?otp=${self.otp}&playbackInfo=${self.playbackInfo}`;
        } else {
            self.iframesrc = url.split('|')[1];
            let params = new URLSearchParams(self.iframesrc);
            self.otp = params.get('otp');
            self.playbackInfo = params.get('playbackInfo');
        }

        // Load the Dyntube API script.
        var tag = document.createElement('script');
        tag.src = "https://player.vdocipher.com/v2/api.js";
        tag.async = true;
        tag.as = "script";
        tag.rel = "preload";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        $(`#${node}`).replaceWith(`
            <iframe id="${node}"
            src="${self.iframesrc}`
            + `&controls=${showControls ? "on" : "off"}"
             frameborder=0 allowFullScreen="true" allow="encrypted-media"></iframe>`);

        let iframe = document.getElementById(node);
        /**
         * Waits for the Dyntube API to be available before initializing the player.
         * @param {Function} resolve - The function to call when Dyntube is ready.
         */
        function waitForVdoPlayer(resolve) {
            if (window.VdoPlayer) {
                player[node] = window.VdoPlayer.getInstance(iframe);
                resolve();
            } else {
                window.requestAnimationFrame(() => waitForVdoPlayer(resolve));
            }
        }

        await new Promise(waitForVdoPlayer);

        // Disable picture-in-picture.
        player[node].video.setAttribute('disablePictureInPicture', '');

        player[node].video.addEventListener('loadedmetadata', async function() {
            self.aspectratio = self.ratio();
            if (isNaN(self.aspectratio)) {
                self.aspectratio = 16 / 9;
            }
            let totaltime = Number((player[node].video.duration).toFixed(2)) - self.frequency;
            end = !end ? totaltime : Math.min(end, totaltime);
            end = Number(end.toFixed(2));
            self.end = end;
            self.totaltime = totaltime;
            self.duration = self.end - self.start;
            player[node].video.currentTime = self.start;

            let captions = await player[node].api.getCaptionLanguages();
            captions = captions.languages || [];
            let tracks = [];
            if (captions && captions.length) {
                captions.forEach((track) => {
                    tracks.push({
                        label: track.label,
                        code: track.lang
                    });
                });
            }

            player[node].api.hideCaptions();
            dispatchEvent('iv:playerLoaded', {
                tracks,
                reloaded
            });
            dispatchEvent('iv:playerReady', null, document.getElementById(node));
            if (opts.editform && !self.url.includes('|')) {
                $('#id_videourl').val(self.url + '|' + self.iframesrc);
            }

            // Remove the start screen on chrome.
            if (navigator.userAgent.toLowerCase().indexOf('chrome') > -1) {
                setTimeout(() => {
                    $('.video-block, #video-block').addClass('no-pointer');
                }, 2000);

                $('#start-screen').remove();
            }
        });

        player[node].video.addEventListener('pause', function() {
            self.paused = true;
            dispatchEvent('iv:playerPaused');
        });

        player[node].video.addEventListener('play', function() {

            self.paused = false;
            dispatchEvent('iv:playerPlay');
            $('.video-block, #video-block').removeClass('no-pointer');
        });

        player[node].video.addEventListener('timeupdate', function() {
            if (self.paused) {
                return;
            }
            if (player[node].video.currentTime < self.start) {
                player[node].video.currentTime = self.start;
            }
            if (player[node].video.currentTime >= self.end + self.frequency && !self.live) {
                player[node].video.currentTime = self.end - self.frequency;
            }
            dispatchEvent('iv:playerPlaying');
            if (self.live) {
                return;
            }
            if (self.ended) {
                self.ended = false;
            } else {
                if (!self.ended && player[node].video.currentTime >= self.end) {
                    self.ended = true;
                    self.paused = true;
                    player[node].video.pause();
                    dispatchEvent('iv:playerEnded');
                }
            }
        });

        player[node].video.addEventListener('error', function(e) {
            dispatchEvent('iv:playerError', {error: e});
        });

        player[node].video.addEventListener('ratechange', function() {
            dispatchEvent('iv:playerRateChange', {rate: player[node].video.playbackRate});
        });

        player[node].video.addEventListener('waiting', function() {
            dispatchEvent('iv:playerBuffering');
        });

        // Volume change event.
        player[node].video.addEventListener('volumechange', function() {
            dispatchEvent('iv:playerVolumeChange', {volume: player[node].video.volume});
        });

        // Quality change event.
        player[node].api.addEventListener('videoQualityChange', function(quality) {
            dispatchEvent('iv:playerQualityChange', {quality: quality});
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
        try {
            player[this.node].video.play();
        } catch (e) {
            player[this.node].api.loadVideo(this.otp, this.playbackInfo);
            player[this.node].video.play();
        }
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
        player[this.node].video.pause();
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
        player[this.node].video.currentTime = starttime || this.start;
        player[this.node].video.pause();
    }
    /**
     * Seeks the video to a specified time.
     *
     * @param {number} time - The time in seconds to seek to.
     * @returns {boolean} Returns true when the seek operation is initiated.
     */
    seek(time) {
        if (!player[this.node]) {
            return time;
        }
        let currentTime = this.getCurrentTime();
        dispatchEvent('iv:playerSeekStart', {time: currentTime});
        this.ended = false;
        player[this.node].video.currentTime = time;
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
        return player[this.node].video.currentTime;
    }
    /**
     * Get the duration of the video
     * @return {Number}
     */
    getDuration() {
        if (!player[this.node]) {
            return 0;
        }
        return player[this.node].video.duration;
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
        return player[this.node].video.paused;
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
        return !player[this.node].video.paused;
    }
    /**
     * Check if the video is ended
     * @return {Boolean}
     */
    isEnded() {
        if (!player[this.node]) {
            return false;
        }
        return player[this.node].video.ended || player[this.node].video.currentTime >= this.end;
    }
    /**
     * Get the aspect ratio of the video
     * @return {Number}
     */
    ratio() {
        if (!player[this.node]) {
            return 16 / 9;
        }
        return player[this.node].video.videoWidth / player[this.node].video.videoHeight;
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
        return player[this.node].video.paused ? 'paused' : 'playing';
    }
    /**
     * Set playback rate of the video
     * @param {Number} rate
     */
    setRate(rate) {
        if (!player[this.node]) {
            return 1;
        }
        player[this.node].video.playbackRate = rate;
        return rate;
    }
    /**
     * Mute the video
     */
    mute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].video.muted = true;
        player[this.node].video.volume = 0;
        dispatchEvent('iv:playerVolumeChange', {volume: 0});
    }
    /**
     * Unmute the video
     */
    unMute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].video.muted = false;
        player[this.node].video.volume = 1;
        dispatchEvent('iv:playerVolumeChange', {volume: 1});
    }

    isMuted() {
        if (!player[this.node]) {
            return false;
        }
        return player[this.node].video.muted;
    }
    /**
     * Get the original player object
     */
    originalPlayer() {
        return player[this.node];
    }

    setQuality(quality) {
        if (!player[this.node]) {
            return quality;
        }
        player[this.node].api.setVideoQuality(quality);
        return quality;
    }

    async getQualities() {
        if (!player[this.node]) {
            return null;
        }
        let qualities = await player[this.node].api.getVideoQualities();
        let qualitiescode = qualities.qualities.map(x => x.id);
        let qualitiesLabel = qualities.qualities.map(x => x.label);
        let currentQuality = qualities.qualities.find(x => x.active) ?
            qualities.qualities.find(x => x.active).id : null;
        return {
            qualities: qualitiescode,
            qualitiesLabel: qualitiesLabel,
            currentQuality: currentQuality,
        };
    }

    setCaption(track) {
        if (!player[this.node]) {
            return track;
        }
        if (track === '') {
            player[this.node].api.hideCaptions();
            return track;
        }
        player[this.node].api.setCaptionLanguage(track);
        return track;
    }


}

export default VdoCipher;