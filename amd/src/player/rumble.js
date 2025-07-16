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
 * Rumble Player class
 * Doc: https://www.rumbleplayer.com/developers/Player-Methods.html
 *
 * @module     mod_interactivevideo/player/rumble
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import {dispatchEvent} from 'core/event_dispatcher';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

var player = {};

class Rumble {
    /**
     * Constructor for the Rumble player.
     */
    constructor() {
        this.type = 'rumble';
        this.useAnimationFrame = true;
        this.frequency = 0.1;
        this.support = {
            playbackrate: false,
            quality: false,
            password: false,
        };
    }
    async getInfo(url, node) {
        this.node = node;
        let self = this;
        return new Promise((resolve) => {
            let oEmbed = 'https://rumble.com/api/Media/oembed.json?url=' + encodeURIComponent(url);
            $.ajax({
                url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                type: 'POST',
                data: {
                    action: 'get_from_url',
                    contextid: M.cfg.contextid,
                    url: oEmbed, // The URL to get the oEmbed data from.
                    sesskey: M.cfg.sesskey,
                },
            }).done(function(data) {
                // Reset api.
                let firstAPIrun = false;
                self.title = data.title;
                self.posterImage = data.thumbnail_url;
                self.duration = Number(data.duration).toFixed(2);
                let html = $(data.html);
                let embedurl = html.attr('src');
                // Regex to get the video id from the embed url https://rumble.com/embed/{id}/
                let videoId = embedurl.match(/embed\/([a-zA-Z0-9]+)/)[1];
                videoId = videoId.split('/')[0]; // This includes the video id and pub id
                self.videoId = videoId;
                // Load the Rumble player library.
                var tag = document.createElement('script');
                tag.src = 'https://rumble.com/embedJS/' + videoId;
                var firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                tag.onload = async() => {
                    // Get the id from the videoId (pubId.videoId || videoId).
                    let id = videoId.split('.')[1] ? videoId.split('.')[1] : videoId;
                    window.Rumble("play", {
                        video: id,
                        div: node,
                        rel: 0,
                        autoplay: 2,
                        ui: {
                            logo: {
                                hidden: true
                            },
                            "fullscreen": {
                                hidden: true
                            },
                            "autoplay": {
                                hidden: true
                            },
                        },
                        api: function(api) {
                            // Not sure if rumble has a ready event, so we use this to make sure we only dispatch the event once.
                            player[node] = api;
                            if (!firstAPIrun) {
                                firstAPIrun = true;
                                resolve({
                                    duration: self.duration,
                                    title: self.title,
                                    posterImage: self.posterImage,
                                });
                            }
                        }
                    });
                };
            });
        });
    }
    /**
     * Load a new Rumble player instance.
     *
     * @param {string} url - The URL of the Rumble video.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} end - The end time of the video in seconds.
     * @param {object} opts - The options for the player.
     */
    async load(url, start, end, opts = {}) {
        const showControls = opts.showControls || false;
        const node = opts.node || 'player';
        this.node = node;
        this.start = start;
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked');
        }
        $('#start-screen, .video-block').addClass('no-pointer');
        let ready = false;
        let firstAPIrun = false;
        let self = this;
        self.ended = 'unknown';
        self.paused = 'unknown';

        let oEmbed = 'https://rumble.com/api/Media/oembed.json?url=' + encodeURIComponent(url);
        $.ajax({
            url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
            type: 'POST',
            data: {
                action: 'get_from_url',
                contextid: M.cfg.contextid,
                url: oEmbed, // The URL to get the oEmbed data from.
                sesskey: M.cfg.sesskey,
            },
        }).done(function(data) {
            // Reset api.
            firstAPIrun = false;
            self.title = data.title;
            self.aspectratio = data.width / data.height;
            self.posterImage = data.thumbnail_url;
            let totaltime = Number(data.duration).toFixed(2) - self.frequency;
            end = !end || end == 0 ? totaltime : Math.min(end, totaltime);
            end = Number(end).toFixed(2);
            self.end = end;
            self.totaltime = totaltime;
            self.duration = self.end - self.start;
            let html = $(data.html);
            let embedurl = html.attr('src');
            // Regex to get the video id from the embed url https://rumble.com/embed/{id}/
            let videoId = embedurl.match(/embed\/([a-zA-Z0-9]+)/)[1];
            videoId = videoId.split('/')[0]; // This includes the video id and pub id
            self.videoId = videoId;
            // Load the Rumble player library.
            var tag = document.createElement('script');
            tag.src = 'https://rumble.com/embedJS/' + videoId;
            var firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            tag.onload = async() => {
                // Get the id from the videoId (pubId.videoId || videoId).
                let id = videoId.split('.')[1] ? videoId.split('.')[1] : videoId;
                window.Rumble("play", {
                    video: id,
                    div: node,
                    rel: 0,
                    autoplay: 2,
                    ui: {
                        logo: {
                            hidden: true
                        },
                        "fullscreen": {
                            hidden: true
                        },
                        "autoplay": {
                            hidden: true
                        },
                    },
                    api: function(api) {
                        // Not sure if rumble has a ready event, so we use this to make sure we only dispatch the event once.
                        player[node] = api;
                        player[node].mute();
                        if (!showControls) {
                            $('body').addClass('no-original-controls');
                        }
                        if (!firstAPIrun) {
                            player[node].setCurrentTime(start);
                            ready = true;
                            firstAPIrun = true;
                            dispatchEvent('iv:playerReady', null, document.getElementById(node));
                        }
                        $(document).off('timeupdate.Rumble').on('timeupdate.Rumble', function() {
                            if (!ready) {
                                return;
                            }

                            if (player[node].getCurrentTime() < start) {
                                player[node].setCurrentTime(start);
                            }
                            if (player[node].getCurrentTime() >= end + self.frequency) {
                                player[node].setCurrentTime(end - self.frequency);
                            }
                        });
                        api.on('play', function() {
                            if (!ready) {
                                return;
                            }
                            self.paused = false;
                            if (!player[node]) {
                                return;
                            }
                            if (player[node].getCurrentTime() < start) {
                                player[node].setCurrentTime(start);
                            }
                            if (self.ended && player[node].getCurrentTime() >= end) {
                                player[node].setCurrentTime(start);
                                player[node].play();
                                self.ended = false;
                            }
                            self.ended = false;
                            dispatchEvent('iv:playerPlay');
                            dispatchEvent('iv:playerPlaying');
                            if (!showControls && !$('body').hasClass('no-original-controls')) {
                                $('body').addClass('no-original-controls');
                            }
                        });
                        api.on("pause", () => {
                            if (!ready) {
                                return;
                            }
                            if (self.ended) {
                                return;
                            }
                            self.paused = true;
                            if (player[node].getCurrentTime() >= end) {
                                self.ended = true;
                                dispatchEvent('iv:playerEnded');
                                return;
                            } else {
                                dispatchEvent('iv:playerPaused');
                            }
                        });
                        api.on("videoEnd", () => {
                            if (!ready) {
                                return;
                            }
                            self.ended = true;
                            self.paused = true;
                            dispatchEvent('iv:playerEnded');
                        });
                    }
                });
            };
        });

    }
    /**
     * Plays the Rumble video player.
     *
     * This method triggers the play action on the Rumble player instance.
     */
    play() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].play();
        this.paused = false;
    }
    /**
     * Pauses the Rumble video player.
     *
     * This method calls the `pause` function on the Rumble player instance,
     * effectively pausing the video playback.
     */
    pause() {
        if (!player[this.node]) {
            return false;
        }
        player[this.node].pause();
        this.paused = true;
        return true;
    }
    /**
     * Stops the video playback and sets the playback time to the specified start time.
     *
     * @param {number} starttime - The time (in seconds) to set the video playback to after pausing.
     */
    stop(starttime) {
        if (!player[this.node]) {
            return;
        }
        player[this.node].pause();
        player[this.node].setCurrentTime(starttime);
    }
    /**
     * Seeks the video player to a specified time.
     *
     * @param {number} time - The time (in seconds) to seek to.
     * @returns {Promise} A promise that resolves when the video player has seeked to the specified time.
     */
    seek(time) {
        if (!player[this.node]) {
            return time;
        }
        let currentTime = this.getCurrentTime();
        dispatchEvent('iv:playerSeekStart', {time: currentTime});
        time = parseFloat(time);
        return new Promise((resolve) => {
            if (time < 0) {
                time = 0;
            }
            this.ended = false;
            player[this.node].setCurrentTime(time);
            dispatchEvent('iv:playerSeek', {time: time});
            resolve(time);
        });
    }
    /**
     * Retrieves the current playback time of the video player.
     *
     * @returns {number} The current time of the video in seconds.
     */
    getCurrentTime() {
        if (!player[this.node]) {
            return 0;
        }
        return player[this.node].getCurrentTime();
    }
    /**
     * Retrieves the duration of the video.
     *
     * @returns {number} The duration of the video in seconds.
     */
    getDuration() {
        if (!player[this.node]) {
            return 0;
        }
        return player[this.node].getDuration();
    }
    /**
     * Checks if the video player is currently paused.
     *
     * @returns {boolean} True if the player is paused, false otherwise.
     */
    isPaused() {
        if (!player[this.node]) {
            return true;
        }
        return this.paused && player[this.node].getPaused();
    }
    /**
     * Checks if the video player is currently playing.
     *
     * @returns {boolean} True if the player is in the 'playing' state, otherwise false.
     */
    isPlaying() {
        if (!player[this.node]) {
            return false;
        }
        return !this.paused;
    }
    /**
     * Checks if the video player has reached the end of the video.
     *
     * @returns {boolean} True if the video has ended, otherwise false.
     */
    isEnded() {
        if (this.ended === 'unknown') {
            return false;
        }
        return this.ended || player[this.node].getCurrentTime() >= this.end;
    }
    /**
     * Calculates the aspect ratio for the video player.
     * If the player's aspect ratio is greater than 16:9, it returns the player's aspect ratio.
     * Otherwise, it returns the default aspect ratio of 16:9.
     *
     * @returns {number} The aspect ratio of the video player.
     */
    async ratio() {
        if (!player[this.node]) {
            return 16 / 9;
        }
        return this.aspectratio;
    }

    /**
     * Destroys the Rumble player instance by removing it from the DOM.
     */
    destroy() {
        try {
            $(`#${this.node}`).remove();
        } catch (e) {
            window.console.error(e);
        }
        $(document).off('timeupdate.Rumble');
        player[this.node] = null;
        dispatchEvent('iv:playerDestroyed');
    }
    /**
     * Retrieves the current state of the player.
     *
     * @returns {Object} The current state of the player.
     */
    async getState() {
        const paused = this.paused;
        return paused ? 'paused' : 'playing';
    }
    /**
     * Sets the playback rate of the video player.
     *
     */
    setRate() {
        // Rumble does not support playback rate.
    }
    /**
     * Mutes the Rumble player.
     */
    mute() {
        player[this.node].mute();
        this.muted = true;
        dispatchEvent('iv:playerVolumeChange', {volume: 0});
    }
    /**
     * Unmutes the video player.
     */
    unMute() {
        player[this.node].unmute();
        player[this.node].setVolume(1);
        this.muted = false;
        dispatchEvent('iv:playerVolumeChange', {volume: 1});
    }

    isMuted() {
        return this.muted;
    }
    /**
     * Returns the original Rumble player instance.
     *
     * @returns {Object} The Rumble player instance.
     */
    originalPlayer() {
        return player[this.node];
    }
    /**
     * Sets the video quality for the player and dispatches a quality change event.
     *
     */
    setQuality() {
        // Rumble does not support video quality.
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
        return null;
    }

    /**
     * Sets the caption track for the video player.
     * @param {string} track - The caption track to set.
     */
    setCaption(track) {
        // Rumble does not support captions.
        return track;
    }
}

export default Rumble;