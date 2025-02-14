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

var player;

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
                        player = api;
                        player.mute();
                        if (!showControls) {
                            $('body').addClass('no-original-controls');
                        }
                        if (!firstAPIrun) {
                            player.setCurrentTime(start);
                            ready = true;
                            firstAPIrun = true;
                            dispatchEvent('iv:playerReady', null, document.getElementById(node));
                        }
                        $(document).on('timeupdate', function() {
                            if (!ready) {
                                return;
                            }

                            if (player.getCurrentTime() < start) {
                                player.setCurrentTime(start);
                            }
                            if (player.getCurrentTime() >= end + self.frequency) {
                                player.setCurrentTime(end - self.frequency);
                            }
                        });
                        api.on('play', function() {
                            if (!ready) {
                                return;
                            }
                            self.paused = false;
                            if (player.getCurrentTime() < start) {
                                player.setCurrentTime(start);
                            }
                            if (self.ended && player.getCurrentTime() >= end) {
                                player.setCurrentTime(start);
                                player.play();
                                self.ended = false;
                            }
                            self.ended = false;
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
                            if (player.getCurrentTime() >= end) {
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
        player.play();
        this.paused = false;
    }
    /**
     * Pauses the Rumble video player.
     *
     * This method calls the `pause` function on the Rumble player instance,
     * effectively pausing the video playback.
     */
    pause() {
        player.pause();
        this.paused = true;
        return true;
    }
    /**
     * Stops the video playback and sets the playback time to the specified start time.
     *
     * @param {number} starttime - The time (in seconds) to set the video playback to after pausing.
     */
    stop(starttime) {
        player.pause();
        player.setCurrentTime(starttime);
    }
    /**
     * Seeks the video player to a specified time.
     *
     * @param {number} time - The time (in seconds) to seek to.
     * @returns {Promise} A promise that resolves when the video player has seeked to the specified time.
     */
    seek(time) {
        time = parseFloat(time);
        return new Promise((resolve) => {
            if (time < 0) {
                time = 0;
            }
            this.ended = false;
            player.setCurrentTime(time);
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
        return player.getCurrentTime();
    }
    /**
     * Retrieves the duration of the video.
     *
     * @returns {number} The duration of the video in seconds.
     */
    getDuration() {
        return player.getDuration();
    }
    /**
     * Checks if the video player is currently paused.
     *
     * @returns {boolean} True if the player is paused, false otherwise.
     */
    isPaused() {
        return this.paused && player.getPaused();
    }
    /**
     * Checks if the video player is currently playing.
     *
     * @returns {boolean} True if the player is in the 'playing' state, otherwise false.
     */
    isPlaying() {
        return !this.paused;
    }
    /**
     * Checks if the video player has reached the end of the video.
     *
     * @returns {boolean} True if the video has ended, otherwise false.
     */
    isEnded() {
        return this.ended || player.getCurrentTime() >= this.end;
    }
    /**
     * Calculates the aspect ratio for the video player.
     * If the player's aspect ratio is greater than 16:9, it returns the player's aspect ratio.
     * Otherwise, it returns the default aspect ratio of 16:9.
     *
     * @returns {number} The aspect ratio of the video player.
     */
    async ratio() {
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
        player.mute();
    }
    /**
     * Unmutes the video player.
     */
    unMute() {
        player.unmute();
        player.setVolume(1);
    }
    /**
     * Returns the original Rumble player instance.
     *
     * @returns {Object} The Rumble player instance.
     */
    originalPlayer() {
        return player;
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
}

export default Rumble;