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
 * Wistia Player class
 * Doc: https://docs.wistia.com/docs/javascript-player-api
 *
 * @module     mod_interactivevideo/player/wistia
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import {dispatchEvent} from 'core/event_dispatcher';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

let player;

class Wistia {
    /**
     * Constructs a new Wistia player instance.
     */
    constructor() {
        this.type = 'wistia';
        this.useAnimationFrame = true;
        this.frequency = 0.3;
        this.support = {
            playbackrate: true,
            quality: true,
            password: true,
        };
    }

    async load(url, start, end, opts = {}) {
        const showControls = opts.showControls || false;
        const node = opts.node || 'player';
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked');
        }
        this.start = start;
        if (opts.passwordprotected) {
            $('#start-screen, .video-block, #video-block').remove();
        }
        if (!showControls) {
            $('body').addClass('no-original-controls');
        }
        // Wistia does not load the video if the player is not visible, so we need to make sure the node parent is visible.
        $(`#${node}`).parent().removeClass('d-none');
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:wistia\.com)\/medias\/([^/]+)/g;
        const match = regex.exec(url);
        const videoId = match[1];
        this.videoId = videoId;
        $(`#${node}`).html(`<div class="wistia_embed wistia_async_${videoId} wmode=transparent
             controlsVisibleOnLoad=true playButton=true videoFoam=false silentAutoPlay=allow playsinline=true
              fullscreenButton=false ${this.allowAutoplay ? `time=${start}` : ``}
               fitStrategy=contain" style="height:100%;width:100%"></div>`);
        let self = this;
        if (opts.editform) {
            $.get('https://fast.wistia.com/oembed.json?url=' + url)
                .then(function(data) {
                    self.posterImage = data.thumbnail_url;
                    self.title = data.title;
                    return self.posterImage;
                }).catch(() => {
                    return;
                });
        }
        let ready = false;
        const wistiaOptions = {
            id: videoId,
            options: {
                plugin: {
                    chapters: {
                        on: false
                    },
                    "postRoll-v1": {
                        on: false
                    }
                }
            },
            onReady: async function(video) {
                $('#annotation-canvas').removeClass('d-none');
                player = video;
                self.aspectratio = self.ratio();
                // We don't want to use the end time from the player, just to avoid any issue restarting the video.
                let totaltime = video.duration() - self.frequency;
                end = !end ? totaltime : Math.min(end, totaltime);
                end = Number(end.toFixed(2));
                self.end = end;
                self.totaltime = Number(totaltime.toFixed(2));
                self.duration = self.end - self.start;

                const eventListeners = () => {
                    video.unmute();
                    video.on("pause", () => {
                        self.paused = true;
                        if ($(document).find('.w-password-protected').length > 0) {
                            return;
                        }
                        if (video.time() >= end) {
                            self.ended = true;
                            dispatchEvent('iv:playerEnded');
                        } else {
                            dispatchEvent('iv:playerPaused');
                        }
                    });

                    video.on("seek", (e) => {
                        if ($(document).find('.w-password-protected').length > 0) {
                            return;
                        }
                        dispatchEvent('iv:playerSeek', {time: e});
                    });

                    video.bind('play', async() => {
                        if (video.time() >= end) {
                            await video.time(start);
                        }
                        self.paused = false;
                        dispatchEvent('iv:playerPlaying');
                    });

                    video.on('timechange', (s) => {
                        self.paused = false;
                        if (s < start) {
                            video.time(start);
                        }
                        if (s >= end + self.frequency) {
                            video.time(end - self.frequency);
                        }
                        if (s >= end) {
                            self.ended = true;
                            dispatchEvent('iv:playerEnded');
                        }
                    });

                    video.on("error", (e) => {
                        dispatchEvent('iv:playerError', {error: e});
                    });

                    video.on("playbackratechange", (e) => {
                        dispatchEvent('iv:playerRateChange', {rate: e});
                    });
                };

                video.mute();
                video.play();
                await video.time(start);
                await video.pause();
                if ($(document).find('.w-password-protected').length > 0) {
                    video.play();
                } else {
                    if (!ready) {
                        ready = true;
                        dispatchEvent('iv:playerReady', null, document.getElementById(node));
                        eventListeners();
                    }
                }
            },
            onError: function(e) {
                dispatchEvent('iv:playerError', {error: e});
            }
        };

        if (!window._wq) {
            // Add wistia script
            var tag = document.createElement('script');
            tag.src = "https://fast.wistia.com/assets/external/E-v1.js";
            tag.async = true;
            tag.as = "script";
            tag.rel = "preload";
            var firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            var interval = setInterval(() => {
                if (window._wq) {
                    clearInterval(interval);
                    window._wq.push(wistiaOptions);
                }
            }, 1000);
        } else {
            window._wq.push(wistiaOptions);
        }
    }
    /**
     * Plays the Wistia video player.
     *
     * This method triggers the play action on the Wistia player instance.
     */
    play() {
        player.play();
        this.paused = false;
    }
    /**
     * Pauses the Wistia video player.
     *
     * This method calls the `pause` function on the Wistia player instance,
     * effectively pausing the video playback.
     */
    async pause() {
        await player.pause();
        this.paused = true;
    }
    /**
     * Stops the video playback and sets the playback time to the specified start time.
     *
     * @param {number} starttime - The time (in seconds) to set the video playback to after pausing.
     */
    stop(starttime) {
        player.pause();
        player.time(starttime);
    }
    /**
     * Seeks the video player to a specified time.
     *
     * @param {number} time - The time in seconds to seek to.
     * @returns {number} The time that was sought to.
     */
    seek(time) {
        player.time(time);
        this.ended = false;
        dispatchEvent('iv:playerSeek', {time: time});
        return time;
    }
    /**
     * Retrieves the current playback time of the video player.
     *
     * @returns {number} The current time of the video in seconds.
     */
    getCurrentTime() {
        return player.time();
    }
    /**
     * Retrieves the duration of the video.
     *
     * @returns {number} The duration of the video in seconds.
     */
    getDuration() {
        return player.duration();
    }
    /**
     * Checks if the video player is currently paused.
     *
     * @returns {boolean} True if the player is paused, false otherwise.
     */
    isPaused() {
        if (this.paused) {
            return true;
        }
        return player.state() === 'paused';
    }
    /**
     * Checks if the video player is currently playing.
     *
     * @returns {boolean} True if the player is in the 'playing' state, otherwise false.
     */
    isPlaying() {
        if (this.paused) {
            return false;
        }
        return player.state() === 'playing';
    }
    /**
     * Checks if the video player has reached the end of the video.
     *
     * @returns {boolean} True if the video has ended, otherwise false.
     */
    isEnded() {
        return this.ended;
    }
    /**
     * Calculates the aspect ratio for the video player.
     * If the player's aspect ratio is greater than 16:9, it returns the player's aspect ratio.
     * Otherwise, it returns the default aspect ratio of 16:9.
     *
     * @returns {number} The aspect ratio of the video player.
     */
    ratio() {
        return player.aspect();
    }

    /**
     * Destroys the Wistia player instance by removing it from the DOM.
     */
    destroy() {
        player.remove();
    }
    /**
     * Retrieves the current state of the player.
     *
     * @returns {Object} The current state of the player.
     */
    getState() {
        return player.state();
    }
    /**
     * Sets the playback rate of the video player.
     *
     * @param {number} rate - The desired playback rate.
     */
    setRate(rate) {
        player.playbackRate(rate);
    }
    /**
     * Mutes the Wistia player.
     */
    mute() {
        player.mute();
    }
    /**
     * Unmutes the video player.
     */
    unMute() {
        player.unmute();
        player.volume(1);
    }
    /**
     * Returns the original Wistia player instance.
     *
     * @returns {Object} The Wistia player instance.
     */
    originalPlayer() {
        return player;
    }
    /**
     * Sets the video quality for the player and dispatches a quality change event.
     *
     * @param {string} quality - The desired video quality to set.
     * @returns {string} The quality that was set.
     */
    setQuality(quality) {
        player.videoQuality(quality);
        dispatchEvent('iv:playerQualityChange', {quality: quality});
        return quality;
    }
    /**
     * Retrieves the available video qualities and the current quality setting.
     *
     * @returns {Object} An object containing:
     * - `qualities` {Array<string>}: List of available video quality options.
     * - `qualitiesLabel` {Array<string>}: List of labels corresponding to the video quality options.
     * - `currentQuality` {string|number}: The current video quality setting.
     */
    getQualities() {
        return {
            qualities: ['auto', '360', '540', '720', '1080', '2160'],
            qualitiesLabel: ['Auto', '360p', '540p', '720p', '1080p', '4k'],
            currentQuality: player.videoQuality() == 'auto' ? 0 : player.videoQuality(),
        };
    }
}

export default Wistia;