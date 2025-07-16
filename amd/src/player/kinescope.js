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
 * Kinescope Player class
 *
 * @module     mod_interactivevideo/player/kinescope
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

let player = {};

class Kinescope {
    /**
     * Constructor for the Kinescope player.
     */
    constructor() {
        this.type = 'kinescope';
        this.useAnimationFrame = false;
        this.support = {
            playbackrate: true,
            quality: true,
            password: true,
        };
        this.frequency = 0.3;
    }

    async getInfo(url, node) {
        this.node = node;
        // Sample video: https://kinescope.io/{token}
        let regex = /kinescope\.io\/(.*)/;
        let match = regex.exec(url);
        let videoId = match[1];
        this.videoId = videoId;
        let self = this;
        return new Promise((resolve) => {
            const playerEvents = function(playerFactory) {
                window.playerFactory
                    .create(node, {
                        url: 'https://kinescope.io/' + videoId,
                        behaviour: {
                            playsInline: true,
                            keyboard: false,
                            localStorage: false,
                            preload: true,
                        },
                        ui: {
                            controls: true,
                        }
                    })
                    .then(function(pl) {
                        pl.off();
                        pl.on(pl.Events.Ready, async function(event) {
                            player[node] = event.target;
                            let totaltime = Number(event.data.duration.toFixed(2));
                            // Scrap the video url to get the video title and poster image in the head.
                            const response = await fetch(url);
                            const data = await response.text();
                            let parser = new DOMParser();
                            let doc = parser.parseFromString(data, 'text/html');
                            let page = $(doc);
                            let title = page.find('meta[property="og:title"]').attr('content');
                            let poster = page.find('meta[property="og:image"]').attr('content');
                            self.title = title;
                            self.posterImage = poster;
                            resolve({
                                duration: totaltime,
                                title: title,
                                posterImage: poster,
                            });
                        });
                    });
            };

            // Create a player instance.
            if (!window.playerFactory) {
                var tag = document.createElement('script');
                tag.src = 'https://player.kinescope.io/latest/iframe.player.js';
                tag.async = true;
                tag.as = "script";
                tag.rel = "preload";
                var firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                window.onKinescopeIframeAPIReady = async function(playerFactory) {
                    window.playerFactory = playerFactory;
                    playerEvents(playerFactory);
                };
            } else {
                $(`#${node}`).replaceWith(`<iframe id="${node}" class="kinescope-player"></iframe>`);
                playerEvents(window.playerFactory);
            }
        });
    }
    /**
     * Load a Sprout Video player instance.
     * Documented at https://kinescope.notion.site/Kinescope-Player-Docs-4e1ecb05be98469da3367ddb71edd9d8
     *
     * @param {string} url - The URL of the Sprout Video video.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} end - The end time of the video in seconds.
     * @param {object} opts - The options for the player.
     * @param {boolean} reloaded
     */
    async load(url, start, end, opts = {}, reloaded = false) {
        const showControls = opts.showControls || false;
        const node = opts.node || 'player';
        this.node = node;
        this.start = start;
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked');
        }
        // Sample video: https://kinescope.io/{token}
        let regex = /kinescope\.io\/(.*)/;
        let match = regex.exec(url);
        let videoId = match[1];
        this.videoId = videoId;
        let ready = false;
        let self = this;
        self.aspectratio = 16 / 9;
        const playerEvents = function(playerFactory) {
            playerFactory
                .create(node, {
                    url: 'https://kinescope.io/' + videoId,
                    behaviour: {
                        playsInline: true,
                        keyboard: false,
                        localStorage: false,
                        preload: true,
                    },
                    ui: {
                        controls: showControls,
                    }
                })
                .then(function(pl) {
                    pl.on(pl.Events.Ready, async function(event) {
                        player[node] = event.target;
                        let totaltime = Number(event.data.duration.toFixed(2)) - self.frequency;
                        end = !end ? totaltime : Math.min(end, totaltime);
                        end = Number(end.toFixed(2));
                        self.aspectratio = event.data.aspectRatio.ratio;
                        self.end = end;
                        self.totaltime = Number(totaltime.toFixed(2));
                        self.duration = self.end - self.start;
                        self.texttracks = event.data.textTracks;
                        self.qualities = event.data.qualities;
                        // Handle text tracks.
                        player[node].disableTextTrack();
                        let tracks = [];
                        if (self.texttracks.length > 0) {
                            self.texttracks.forEach((track) => {
                                tracks.push({
                                    label: track.label,
                                    code: track.language,
                                });
                            });
                            self.captions = tracks;
                        }

                        dispatchEvent('iv:playerLoaded', {
                            tracks: tracks,
                            qualities: self.getQualities(),
                            reloaded: reloaded,
                        });

                        // Scrap the video url to get the video title and poster image in the head.
                        if (opts.editform) {
                            const response = await fetch(url);
                            const data = await response.text();
                            let parser = new DOMParser();
                            let doc = parser.parseFromString(data, 'text/html');
                            let page = $(doc);
                            let title = page.find('meta[property="og:title"]').attr('content');
                            let poster = page.find('meta[property="og:image"]').attr('content');
                            self.title = title;
                            self.posterImage = poster;
                        }
                        await player[node].seekTo(start);
                        await player[node].pause();
                        ready = true;
                        dispatchEvent('iv:playerReady', null, document.getElementById(node));
                    });
                    pl.on(pl.Events.Play, async function(event) {
                        if (!ready) {
                            return;
                        }
                        self.paused = false;
                        self.ended = false;
                        dispatchEvent('iv:playerPlay');
                        const time = await player[node].getCurrentTime();
                        if (time >= end) {
                            self.ended = true;
                            self.paused = true;
                            dispatchEvent('iv:playerEnded');
                        }
                    });
                    pl.on(pl.Events.Pause, async function(event) {
                        if (!ready) {
                            return;
                        }
                        self.paused = true;
                        dispatchEvent('iv:playerPaused');
                    });
                    pl.on(pl.Events.Ended, function(event) {
                        if (!ready) {
                            return;
                        }
                        self.ended = true;
                        self.paused = true;
                        dispatchEvent('iv:playerEnded');
                    });
                    pl.on(pl.Events.TimeUpdate, async function(event) {
                        if (!ready) {
                            return;
                        }
                        let currentTime = await player[node].getCurrentTime();
                        if (currentTime < start) {
                            await player[node].seekTo(start);
                            self.ended = false;
                        }
                        if (currentTime > end + self.frequency) {
                            await player[node].seekTo(end - self.frequency);
                            return;
                        }
                        if (currentTime >= end) {
                            self.ended = true;
                            await player[node].seekTo(end);
                            dispatchEvent('iv:playerEnded');
                        } else if (!self.paused) {
                            self.paused = false;
                            dispatchEvent('iv:playerPlaying');
                        };
                    });
                    pl.on(pl.Events.QualityChanged, async function(event) {
                        if (!ready) {
                            return;
                        }
                        dispatchEvent('iv:playerQualityChange', {quality: event.quality});
                    })
                    pl.on(pl.Events.PlaybackRateChange, async function(event) {
                        if (!ready) {
                            return;
                        }
                        dispatchEvent('iv:playerSpeedChange', {rate: event.playbackRate});
                    });
                    pl.on(pl.Events.Waiting, async function(event) {
                        if (!ready) {
                            return;
                        }
                        dispatchEvent('iv:playerBuffering');
                    });
                    pl.on(pl.Events.VolumeChange, async function(event) {
                        if (!ready) {
                            return;
                        }
                        dispatchEvent('iv:playerVolumeChange', {volume: event.data.muted ? 0 : 1});
                    });
                });
        };

        // Create a player instance.
        if (!window.Kinescope) {
            var tag = document.createElement('script');
            tag.src = 'https://player.kinescope.io/latest/iframe.player.js';
            tag.async = true;
            tag.as = "script";
            tag.rel = "preload";
            var firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            window.onKinescopeIframeAPIReady = async function(playerFactory) {
                window.playerFactory = playerFactory;
                playerEvents(playerFactory);
            };
        } else {
            // Create an iframe.
            let $parent = $(`#${node}`).parent();
            $parent.html(`<iframe id="${node}"></iframe>`);
            playerEvents(window.playerFactory);
        }
    }
    /**
     * Plays the video using the Sprout Video player instance.
     * If the player is not initialized, logs an error to the console.
     */
    async play() {
        if (!player[this.node]) {
            return;
        }
        await player[this.node].play();
        this.paused = false;
    }
    /**
     * Pauses the Sprout Video player.
     *
     * This method calls the `pause` function on the `player` object to pause the video playback.
     */
    async pause() {
        if (!player[this.node]) {
            return;
        }
        await player[this.node].pause();
        this.paused = true;
    }
    /**
     * Stops the video playback and sets the current time to the specified start time.
     *
     * @param {number} starttime - The time in seconds to which the video should be set before pausing.
     */
    stop(starttime) {
        if (!player[this.node]) {
            return;
        }
        player[this.node].seekTo(starttime);
        player[this.node].pause();
    }
    /**
     * Seeks the video to a specified time.
     *
     * @param {number} time - The time in seconds to seek to.
     * @returns {Promise<number>} A promise that resolves to the time in seconds to which the video was seeked.
     */
    async seek(time) {
        if (!player[this.node]) {
            return time;
        }
        if (time < 0) {
            time = 0;
        }
        let currentTime = await this.getCurrentTime();
        dispatchEvent('iv:playerSeekStart', {time: currentTime});
        this.ended = false;
        player[this.node].seekTo(parseFloat(time));
        dispatchEvent('iv:playerSeek', {time: time});
        return time;
    }
    /**
     * Retrieves the current playback time of the video.
     *
     * @returns {Promise<number>} A promise that resolves to the current time in seconds.
     */
    async getCurrentTime() {
        if (!player[this.node]) {
            return 0;
        }
        return await player[this.node].getCurrentTime();
    }
    /**
     * Asynchronously retrieves the duration of the video.
     *
     * @returns {Promise<number>} A promise that resolves to the duration of the video in seconds.
     */
    async getDuration() {
        if (!player[this.node]) {
            return 0;
        }
        const duration = await player[this.node].getDuration();
        return duration;
    }
    /**
     * Checks if the Sprout Video player is paused.
     *
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the player is paused.
     */
    async isPaused() {
        if (!player[this.node]) {
            return true;
        }
        if (this.paused) {
            return true;
        }
        let paused = await player[this.node].isPaused();
        return paused;
    }
    /**
     * Checks if the Sprout Video player is currently playing.
     *
     * @returns {Promise<boolean>} A promise that resolves to `true` if the player is playing, otherwise `false`.
     */
    async isPlaying() {
        if (!player[this.node]) {
            return false;
        }
        if (this.paused) {
            return false;
        }
        let paused = await player[this.node].isPaused();
        return !paused;
    }
    /**
     * Checks if the Sprout Video player has ended.
     *
     * @async
     * @function isEnded
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the player has ended.
     */
    async isEnded() {
        if (!player[this.node]) {
            return false;
        }
        if (this.ended) {
            return true;
        }
        let ended = await player[this.node].isEnded();
        return ended;
    }
    /**
     * Calculates the aspect ratio of the video.
     * If the video's aspect ratio is greater than 16:9, it returns the actual aspect ratio.
     * Otherwise, it returns the 16:9 aspect ratio.
     *
     * @returns {Promise<number>} The aspect ratio of the video.
     */
    async ratio() {
        if (!player[this.node]) {
            return 16 / 9;
        }
        return this.aspectratio;
    }
    /**
     * Destroys the Sprout Video player instance if it is initialized.
     * If the player is not initialized, logs an error message to the console.
     */
    async destroy() {
        if (player[this.node]) {
            player[this.node].off();
            player[this.node].destroy();
        } else {
            $(`#${this.node}`).remove();
        }
        player[this.node] = null;
        dispatchEvent('iv:playerDestroyed');
    }
    /**
     * Asynchronously retrieves the current state of the video player.
     *
     * @returns {Promise<string>} A promise that resolves to a string indicating the player's state, either 'paused' or 'playing'.
     */
    async getState() {
        if (!player[this.node]) {
            return 'paused';
        }
        const paused = await player[this.node].isPaused();
        return paused ? 'paused' : 'playing';
    }
    /**
     * Sets the playback rate for the Sprout Video player.
     *
     * @param {number} rate - The desired playback rate.
     *                        This should be a value supported by the Sprout Video player.
     */
    setRate(rate) {
        if (!player[this.node]) {
            return;
        }
        player[this.node].setPlaybackRate(rate);
    }
    /**
     * Mutes the Sprout Video player by setting the volume to 0.
     */
    mute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].mute();
    }
    /**
     * Unmutes the Sprout Video player by setting the volume to 1.
     */
    unMute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].unmute();
        player[this.node].setVolume(1);
    }

    isMuted() {
        if (!player[this.node]) {
            return false;
        }
        return player[this.node].isMuted();
    }

    /**
     * Set quality of the video
     * @param {String} quality
     */
    async setQuality(quality) {
        if (!player[this.node]) {
            return quality;
        }
        await player[this.node].setVideoQuality(quality);
        return quality;
    }
    /**
     * Get the available qualities of the video
     */
    async getQualities() {
        if (!player[this.node]) {
            return null;
        }
        let qualities = await player[this.node].getVideoQualityList();
        let keys = qualities;
        let values = qualities.map(x => x == 'auto' ? 'Auto' : x);
        let current = await player[this.node].getCurrentVideoQuality();
        return {
            qualities: keys,
            qualitiesLabel: values,
            currentQuality: current,
        };
    }

    /**
     * Set subtitle
     *  @param {String} language
     */
    async setCaption(language) {
        if (!player[this.node]) {
            return null;
        }
        if (language === 'off' || language === '') {
            await player[this.node].disableTextTrack();
        } else {
            await player[this.node].enableTextTrack(language);
        }
        return language;
    }

    /**
     * Returns the original Sprout Video player instance.
     *
     * @returns {Object} The Sprout Video player instance.
     */
    originalPlayer() {
        return player[this.node];
    }
}

export default Kinescope;