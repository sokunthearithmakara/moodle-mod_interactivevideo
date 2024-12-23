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
 * Vimeo Player class
 *
 * @module     mod_interactivevideo/player/vimeo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
let player;

class Vimeo {
    /**
     * Constructs a Vimeo player instance.
     *
     * @param {string} url - The URL of the Vimeo video.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} end - The end time of the video in seconds.
     * @param {object} opts - The options for the player.
     */
    constructor(url, start, end, opts = {}) {
        const showControls = opts.showControls || false;
        const node = opts.node || 'player';
        this.type = 'vimeo';
        this.start = start;
        this.frequency = 0.27;
        this.support = {
            playbackrate: true,
            quality: true,
        };
        // Documented at https://developer.vimeo.com/player/sdk/reference or https://github.com/vimeo/player.js
        let VimeoPlayer;
        var regex = /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:video\/)?([^/]+)/g;
        this.videoId = regex.exec(url)[1];
        // Get poster image using oEmbed.
        var posterUrl = 'https://vimeo.com/api/oembed.json?url=https%3A//vimeo.com/' + this.videoId;
        fetch(posterUrl)
            .then(response => response.json())
            .then(data => {
                var poster = data.thumbnail_url;
                // Change the dimensions of the poster image to 16:9.
                poster = poster.replace(/_\d+x\d+/, '_720x405');
                this.posterImage = poster;
                this.title = data.title;
                this.aspectratio = data.width / data.height;
                return poster;
            }).catch(() => {
                return;
            });
        let self = this;
        const option = {
            url: url,
            width: 1080,
            height: 720,
            autoplay: !showControls,
            controls: showControls,
            loop: false,
            muted: true,
            playsinline: true,
            background: false,
            byline: false,
            portrait: false,
            title: false,
            transparent: false,
            responsive: false,
            start_time: start,
            end_time: end,
            pip: false,
            fullscreen: false,
            watch_full_video: false,
            keyboard: false,
            dnt: true,
        };

        let ready = false;
        const vimeoEvents = (player) => {
            player.on('loaded', async function() {
                let duration = await player.getDuration();
                end = !end ? duration - 0.1 : Math.min(end, duration - 0.1);
                end = Number(end.toFixed(2));
                self.end = end;
                self.duration = self.end - self.start;
                self.totaltime = Number((duration - 0.1).toFixed(2));
                // Get track list.
                // Unset the captions.
                player.disableTextTrack();
                let tracks = await player.getTextTracks();
                if (tracks && tracks.length > 0) {
                    tracks = tracks.map((track) => {
                        return {
                            label: track.label,
                            code: track.language
                        };
                    });
                }

                dispatchEvent('iv:playerLoaded', {
                    tracks: tracks,
                    qualities: self.getQualities(),
                });

                if (showControls) {
                    ready = true;
                    dispatchEvent('iv:playerReady');
                }
            });

            if (!showControls) {
                player.on('play', async function() {
                    if (!ready) {
                        // Pause the video if it is not ready.
                        await player.pause();
                        player.setCurrentTime(start);
                        // Unmute the video.
                        player.setVolume(1);
                        ready = true;
                        dispatchEvent('iv:playerReady');
                    }
                });
            }

            player.on('timeupdate', async function() {
                if (!ready) {
                    return;
                }
                let isEnded = await player.getEnded();
                let currentTime = await player.getCurrentTime();
                if (isEnded || (end && currentTime >= end)) {
                    dispatchEvent('iv:playerEnded');
                    player.pause();
                } else if (await player.getPaused()) {
                    dispatchEvent('iv:playerPaused');
                } else {
                    dispatchEvent('iv:playerPlaying');
                }
            });

            player.on('seeked', function(e) {
                if (!ready) {
                    return;
                }
                dispatchEvent('iv:playerSeek', {time: e.seconds});
            });

            player.on('playbackratechange', function(e) {
                if (!ready) {
                    return;
                }
                dispatchEvent('iv:playerRateChange', {rate: e.playbackRate});
            });

            player.on('bufferstart', function() {
                if (!ready) {
                    return;
                }
                dispatchEvent('iv:playerPaused');
            });

            player.on('bufferend', function() {
                if (!ready) {
                    return;
                }
                dispatchEvent('iv:playerPlaying');
            });

            player.on('ended', function() {
                if (!ready) {
                    return;
                }
                dispatchEvent('iv:playerEnded');
            });

            player.on('qualitychange', function(e) {
                if (!ready) {
                    return;
                }
                dispatchEvent('iv:playerQualityChange', {quality: e.quality});
            });
        };

        if (!VimeoPlayer) {
            require(['https://player.vimeo.com/api/player.js'], function(Player) {
                VimeoPlayer = Player;
                player = new Player(node, option);
                vimeoEvents(player);
            });
        } else {
            player = new VimeoPlayer(node, option);
            vimeoEvents(player);
        }
    }
    /**
     * Plays the video using the Vimeo player instance.
     * If the player is not initialized, logs an error to the console.
     */
    play() {
        player.play();
    }
    /**
     * Pauses the Vimeo player.
     *
     * This method calls the `pause` function on the `player` object to pause the video playback.
     */
    async pause() {
        await player.pause();
    }
    /**
     * Stops the video playback and sets the current time to the specified start time.
     *
     * @param {number} starttime - The time in seconds to which the video should be set before pausing.
     */
    stop(starttime) {
        player.setCurrentTime(starttime);
        player.pause();
    }
    /**
     * Seeks the video to a specified time.
     *
     * @param {number} time - The time in seconds to seek to.
     * @returns {Promise<number>} A promise that resolves to the time sought to.
     */
    async seek(time) {
        if (time < 0) {
            time = 0;
        }
        await player.setCurrentTime(time);
        return time;
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
     * Checks if the Vimeo player is paused.
     *
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the player is paused.
     */
    async isPaused() {
        const paused = await player.getPaused();
        return paused;
    }
    /**
     * Checks if the Vimeo player is currently playing.
     *
     * @returns {Promise<boolean>} A promise that resolves to `true` if the player is playing, otherwise `false`.
     */
    async isPlaying() {
        const paused = await player.getPaused();
        return !paused;
    }
    /**
     * Checks if the Vimeo player has ended.
     *
     * @async
     * @function isEnded
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the player has ended.
     */
    async isEnded() {
        const ended = await player.getEnded();
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
        const width = await player.getVideoWidth();
        const height = await player.getVideoHeight();
        return width / height;
    }
    /**
     * Destroys the Vimeo player instance if it is initialized.
     * If the player is not initialized, logs an error message to the console.
     */
    destroy() {
        if (player) {
            player.destroy();
        } else {
            window.console.error('Player is not initialized.');
        }
    }
    /**
     * Asynchronously retrieves the current state of the video player.
     *
     * @returns {Promise<string>} A promise that resolves to a string indicating the player's state, either 'paused' or 'playing'.
     */
    async getState() {
        const paused = await player.getPaused();
        return paused ? 'paused' : 'playing';
    }
    /**
     * Sets the playback rate for the Vimeo player.
     *
     * @param {number} rate - The desired playback rate.
     *                        This should be a value supported by the Vimeo player.
     */
    setRate(rate) {
        player.setPlaybackRate(rate);
    }
    /**
     * Mutes the Vimeo player by setting the volume to 0.
     */
    mute() {
        player.setVolume(0);
    }
    /**
     * Unmutes the Vimeo player by setting the volume to 1.
     */
    unMute() {
        player.setVolume(1);
    }

    /**
     * Set quality of the video
     * @param {String} quality
     */
    setQuality(quality) {
        player.setQuality(quality);
        return quality;
    }
    /**
     * Get the available qualities of the video
     */
    async getQualities() {
        let qualities = await player.getQualities();
        let keys = qualities.map(x => x.id);
        let values = qualities.map(x => x.label);
        let current = qualities.find(x => x.active).id;
        return {
            qualities: keys,
            qualitiesLabel: values,
            currentQuality: current,
        };
    }

    /**
     * Set subtitle
     *
     * @param {string} track language code
     */
    setCaption(track) {
        if (track != '') {
            player.enableTextTrack(track);
        } else {
            player.disableTextTrack();
        }
    }

    /**
     * Returns the original Vimeo player instance.
     *
     * @returns {Object} The Vimeo player instance.
     */
    originalPlayer() {
        return player;
    }
}

export default Vimeo;