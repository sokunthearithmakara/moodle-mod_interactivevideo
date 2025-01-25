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
 * Sprout Video Player class
 *
 * @module     mod_interactivevideo/player/sproutvideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

let player;

class SproutVideo {
    /**
     * Constructs a new Sprout Video player instance.
     */
    constructor() {
        this.type = 'sproutvideo';
        this.useAnimationFrame = true;
        this.support = {
            playbackrate: true,
            quality: true,
            password: true,
        };
        this.frequency = 0.1;
    }
    /**
     * Load a Sprout Video player instance.
     * Documented at https://sproutvideo.com/help/articles/27-javascript_player_api
     *
     * @param {string} url - The URL of the Sprout Video video.
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
        this.end = end;
        let regex = /(?:https?:\/\/)?(?:[^.]+\.)*(?:sproutvideo\.com\/(?:videos|embed)|vids\.io\/videos)\/(.+)/;
        let match = regex.exec(url);
        let videoId = match[1];
        if (!url.includes('embed')) {
            videoId = videoId.split('/')[0];
        }
        this.videoId = videoId;
        let ready = false;
        let self = this;

        self.ended = false;
        self.paused = false;

        const executeFunction = (player) => {
            player.bind('ready', function() {
                let totaltime = Number(player.getDuration()).toFixed(2) - self.frequency;
                end = !end || end == 0 ? totaltime : Math.min(end, totaltime);
                end = Number(end).toFixed(2);
                self.end = end;
                self.totaltime = totaltime;
                self.duration = self.end - self.start;
                ready = true;
                dispatchEvent('iv:playerReady', null, document.getElementById(node));
                player.setVolume(1.0);
            });

            player.bind('qualityLevels', function(event) {
                self.qualities = event.data;
            });

            player.bind('qualityLevelChange', function(event) {
                dispatchEvent('iv:playerQualityChange', {quality: event.data.height});
            });

            player.bind('rateChange', function(event) {
                dispatchEvent('iv:playerRateChange', {rate: event.data});
            });

            player.bind('progress', function(event) {
                if (!ready) {
                    player.setVolume(0.0);
                    return;
                }
                let currentTime = event.data.time;
                if (currentTime < start) {
                    player.seek(start);
                }
                if (currentTime >= end) {
                    player.seek(start);
                    dispatchEvent('iv:playerEnded');
                    self.ended = true;
                }
            });

            player.bind('play', function() {
                if (!ready) {
                    player.setVolume(0.0);
                    return;
                }
                let currentTime = player.getCurrentTime();
                if (self.ended || currentTime >= end) {
                    player.seek(start);
                }
                self.paused = false;
                self.ended = false;
                dispatchEvent('iv:playerPlaying');
            });

            player.bind('pause', function() {
                if (!ready) {
                    return;
                }
                self.paused = true;
                if (player.getCurrentTime() >= end) {
                    dispatchEvent('iv:playerEnded');
                    self.ended = true;
                } else {
                    dispatchEvent('iv:playerPaused');
                }
            });

            player.bind('completed', function() {
                self.ended = true;
                dispatchEvent('iv:playerEnded');
            });
        };

        // Get video info using oEmbed: https://sproutvideo.com/oembed.json?url=https://sproutvideo.com/videos/ac91d7b31a1ee6c125.

        const getData = async() => {
            try {
                const data = await $.ajax({
                    url: `https://sproutvideo.com/oembed.json?url=https://sproutvideo.com/videos/${videoId}`,
                    type: 'GET',
                    dataType: 'json',
                });
                return data;
            } catch {
                return {error: true};
            }
        };
        let data = await getData();
        let iframeurl = '';
        if (data.error) {
            iframeurl = `https://videos.sproutvideo.com/embed/${videoId}`;
            self.title = 'Private Video';
            self.aspectratio = 16 / 9;
            if (!url.includes('embed')) {
                dispatchEvent('iv:playerError', {message: 'Video not found'});
            }
        } else {
            self.title = data.title;
            self.aspectratio = data.width / data.height;
            self.posterImage = data.thumbnail_url;
            // Get iframe url from data.html
            let iframe = $(data.html);
            iframeurl = iframe.attr('src');
        }

        iframeurl += '?fullscreenButton=false&volume=0';
        if (!showControls) {
            iframeurl += '&showControls=false&bigPlayButton=false';
        }
        if (start > 0) {
            iframeurl += `&t=${start}`;
        }

        $.get(iframeurl).catch(() => {
            dispatchEvent('iv:playerError', {message: 'Video not found'});
        });

        $('.video-block').remove();
        $('#annotation-canvas').removeClass('d-none');
        $(`#${node}`).replaceWith(`<iframe id="${node}" class='sproutvideo-player'
                 src='${iframeurl}' frameborder='0' referrerpolicy="no-referrer-when-downgrade"
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media;"></iframe>`);

        // Create a player instance.
        if (!window.SV) {
            var tag = document.createElement('script');
            tag.src = 'https://c.sproutvideo.com/player_api.js';
            tag.async = true;
            tag.as = "script";
            tag.rel = "preload";
            var firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            tag.onload = function() {
                player = new window.SV.Player({videoId: videoId.split('/')[0]});
                executeFunction(player);
            };
        } else {
            player = new window.SV.Player({videoId: videoId.split('/')[0]});
            executeFunction(player);
        }

    }
    /**
     * Plays the video using the Sprout Video player instance.
     * If the player is not initialized, logs an error to the console.
     */
    play() {
        player.play();
        this.paused = false;
    }
    /**
     * Pauses the Sprout Video player.
     *
     * This method calls the `pause` function on the `player` object to pause the video playback.
     */
    pause() {
        player.pause();
        this.paused = true;
    }
    /**
     * Stops the video playback and sets the current time to the specified start time.
     *
     * @param {number} starttime - The time in seconds to which the video should be set before pausing.
     */
    stop(starttime) {
        player.seek(starttime);
        player.pause();
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
        player.seek(time);
        dispatchEvent('iv:playerSeek', {time: time});
        return true;
    }
    /**
     * Retrieves the current playback time of the video.
     *
     * @returns {Promise<number>} A promise that resolves to the current time in seconds.
     */
    async getCurrentTime() {
        return player.getCurrentTime();
    }
    /**
     * Asynchronously retrieves the duration of the video.
     *
     * @returns {Promise<number>} A promise that resolves to the duration of the video in seconds.
     */
    async getDuration() {
        const duration = await player.getDuration();
        return duration;
    }
    /**
     * Checks if the Sprout Video player is paused.
     *
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the player is paused.
     */
    isPaused() {
        return this.paused;
    }
    /**
     * Checks if the Sprout Video player is currently playing.
     *
     * @returns {Promise<boolean>} A promise that resolves to `true` if the player is playing, otherwise `false`.
     */
    isPlaying() {
        return !this.paused;
    }
    /**
     * Checks if the Sprout Video player has ended.
     *
     * @async
     * @function isEnded
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the player has ended.
     */
    isEnded() {
        return this.ended;
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
     * Destroys the Sprout Video player instance if it is initialized.
     * If the player is not initialized, logs an error message to the console.
     */
    destroy() {
        if (player) {
            $('#player').attr('src', '');
            player.unbind();
        } else {
            window.console.error('Player is not initialized.');
        }
    }
    /**
     * Asynchronously retrieves the current state of the video player.
     *
     * @returns {Promise<string>} A promise that resolves to a string indicating the player's state, either 'paused' or 'playing'.
     */
    getState() {
        const paused = this.paused;
        return paused ? 'paused' : 'playing';
    }
    /**
     * Sets the playback rate for the Sprout Video player.
     *
     * @param {number} rate - The desired playback rate.
     *                        This should be a value supported by the Sprout Video player.
     */
    setRate(rate) {
        player.setPlaybackRate(rate);
    }
    /**
     * Mutes the Sprout Video player by setting the volume to 0.
     */
    mute() {
        player.setVolume(0.0);
    }
    /**
     * Unmutes the Sprout Video player by setting the volume to 1.
     */
    unMute() {
        player.setVolume(1.0);
    }

    /**
     * Set quality of the video
     * @param {String} quality
     */
    setQuality(quality) {
        player.setQualityLevel(quality);
        return quality;
    }
    /**
     * Get the available qualities of the video
     */
    async getQualities() {
        let qualities = this.qualities;
        let keys = qualities.map(x => x.height);
        // Add auto quality to the top of the list
        keys.unshift('auto');
        let values = qualities.map(x => x.label);
        // Add auto quality to the top of the list
        values.unshift('Auto');
        let current = player.getQualityLevel();
        return {
            qualities: keys,
            qualitiesLabel: values,
            currentQuality: current,
        };
    }

    /**
     * Set subtitle
     *
     */
    setCaption() {
        // Not supported
    }

    /**
     * Returns the original Sprout Video player instance.
     *
     * @returns {Object} The Sprout Video player instance.
     */
    originalPlayer() {
        return player;
    }
}

export default SproutVideo;