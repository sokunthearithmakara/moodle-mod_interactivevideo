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
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

let player = {};

class Vimeo {
    /**
     * Constructs a new Vimeo player instance.
     */
    constructor() {
        this.type = 'vimeo';
        this.useAnimationFrame = false;
        this.frequency = 0.27;
        this.support = {
            playbackrate: true,
            quality: true,
            password: true,
        };
    }
    async getInfo(url, node) {
        this.node = node;
        return new Promise((resolve) => {
            let VimeoPlayer;
            const option = {
                url: url,
                width: 1080,
                height: 720,
            };
            const vimeoEvents = (player) => {
                player.on('loaded', async function() {
                    let title = await player.getVideoTitle();
                    let duration = await player.getDuration();
                    // Get poster image using oEmbed.
                    var posterUrl = 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(url);
                    const oEmbed = await fetch(posterUrl);
                    if (!oEmbed.ok) {
                        resolve(null);
                    }
                    const oEmbedData = await oEmbed.json();
                    if (oEmbedData.domain_status_code === 403 || oEmbedData.error) {
                        resolve(null);
                    }
                    let posterImage = oEmbedData.thumbnail_url || '';
                    resolve({
                        duration,
                        title,
                        posterImage: posterImage.replace(/_\d+x\d+/, '_720x405'),
                    });
                });
            };

            if (!VimeoPlayer) {
                try {
                    require(['https://player.vimeo.com/api/player.js'], function(Player) {
                        VimeoPlayer = Player;
                        player[node] = new Player(node, option);
                        vimeoEvents(player[node]);
                    });
                } catch (e) {
                    dispatchEvent('iv:playerError', {error: e.message});
                    return;
                }
            } else {
                player[node] = new VimeoPlayer(node, option);
                vimeoEvents(player[node]);
            }
        });
    }
    /**
     * Load player instance.
     *
     * @param {string} url - The URL of the Vimeo video.
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
            dispatchEvent('iv:autoplayBlocked');
        }
        this.start = start;
        // Documented at https://developer.vimeo.com/player/sdk/reference or https://github.com/vimeo/player.js
        let VimeoPlayer;
        this.aspectratio = 16 / 9;
        // Get poster image using oEmbed.
        var posterUrl = 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(url);
        const oEmbed = await fetch(posterUrl);
        if (!oEmbed.ok) {
            dispatchEvent('iv:playerError', {error: 'Video not found'});
            return;
        }
        document.getElementById('video-wrapper').style.display = 'block';
        const oEmbedData = await oEmbed.json();
        if (oEmbedData.domain_status_code === 403 || oEmbedData.error) {
            dispatchEvent('iv:playerError', {error: 'Video not found'});
        }
        this.posterImage = oEmbedData.thumbnail_url || '';
        this.title = oEmbedData.title;
        this.videoId = oEmbedData.video_id;
        // Change the dimensions of the poster image to 16:9.
        this.posterImage = this.posterImage.replace(/_\d+x\d+/, '_720x405');
        this.aspectratio = oEmbedData.width / oEmbedData.height;
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
            "start_time": start,
            "end_time": end,
            pip: false,
            fullscreen: false,
            "watch_full_video": false,
            keyboard: false,
            dnt: true,
            chapters: showControls,
            "interactive_markers": showControls,
            "vimeo_logo": false,
            "initial_quality": '360p',
        };

        let ready = false;
        const vimeoEvents = (player) => {
            player.on('loaded', async function() {
                const iframe = document.querySelector(`#${node} iframe`);
                if (iframe) {
                    iframe.setAttribute('referrerpolicy', 'strict-origin');
                }
                let duration = 0;
                try {
                    // Without password protection, we can get the duration.
                    duration = await player.getDuration();
                } catch (e) {
                    return;
                }
                if (duration > 0) {
                    end = !end ? duration - 0.1 : Math.min(end, duration - 0.1);
                    end = Number(end.toFixed(2));
                    self.end = end;
                    self.duration = self.end - self.start;
                    self.totaltime = Number((duration - 0.1).toFixed(2));
                    self.title = await player.getVideoTitle();
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

                    if (!opts.passwordprotected) {
                        dispatchEvent('iv:playerLoaded', {
                            tracks: tracks,
                            qualities: self.getQualities(),
                            reloaded: reloaded,
                        });
                    }

                    ready = true;
                    dispatchEvent('iv:playerReady', null, document.getElementById(node));
                    // Unmute the video
                    player.setVolume(1);
                } else {
                    document.getElementById('video-wrapper').style.display = 'block';
                    const startScreen = document.getElementById('start-screen');
                    if (startScreen) {
                        startScreen.classList.add('d-none');
                    }

                    const videoBlock = document.querySelector('.video-block');
                    if (videoBlock) {
                        videoBlock.classList.add('no-pointer', 'bg-transparent');
                    }

                    const annotationCanvas = document.getElementById('annotation-canvas');
                    if (annotationCanvas) {
                        annotationCanvas.classList.remove('d-none', 'w-0');
                    }
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
                        dispatchEvent('iv:playerReady', null, document.getElementById(node));
                    }
                });
            }

            player.off('play');
            player.on('play', function() {
                if (!ready) {
                    return;
                }
                self.paused = false;
                self.ended = false;
                dispatchEvent('iv:playerPlay');
            });

            player.on('pause', function(e) {
                if (!ready) {
                    return;
                }
                self.paused = true;
                if (e.seconds >= end) {
                    self.ended = true;
                    dispatchEvent('iv:playerEnded');
                } else {
                    self.ended = false;
                    dispatchEvent('iv:playerPaused');
                }
            });

            player.on('timeupdate', async function(e) {
                if (!ready) {
                    return;
                }
                if (e.seconds >= end) {
                    self.ended = true;
                    self.paused = true;
                    dispatchEvent('iv:playerEnded');
                } else if (await player.getPaused()) {
                    self.paused = true;
                    dispatchEvent('iv:playerPaused');
                } else {
                    self.paused = false;
                    self.ended = false;
                    dispatchEvent('iv:playerPlaying');
                }
            });

            player.on('playbackratechange', function(e) {
                if (!ready) {
                    return;
                }
                dispatchEvent('iv:playerRateChange', {rate: e.playbackRate});
            });

            player.on('ended', function() {
                if (!ready) {
                    return;
                }
                self.ended = true;
                self.paused = true;
                dispatchEvent('iv:playerEnded');
            });

            player.on('qualitychange', function(e) {
                if (!ready) {
                    return;
                }
                dispatchEvent('iv:playerQualityChange', {quality: e.quality});
            });

            player.on('error', function(e) {
                if (e.name === 'NotAllowedError') {
                    return;
                }
                if (e.method === 'appendVideoMetadata') {
                    return;
                }
                dispatchEvent('iv:playerError', {error: e.message});
                if (!showControls) {
                    const $videoblock = document.querySelector('.video-block');
                    if ($videoblock) {
                        $videoblock.classList.remove('no-pointer');
                    }
                }
            });

            player.on('volumechange', function(e) {
                dispatchEvent('iv:playerVolumeChange', {volume: e.volume});
            });
        };

        if (!VimeoPlayer) {
            try {
                require(['https://player.vimeo.com/api/player.js'], function(Player) {
                    VimeoPlayer = Player;
                    player[node] = new Player(node, option);
                    vimeoEvents(player[node]);
                });
            } catch (e) {
                dispatchEvent('iv:playerError', {error: e.message});
                return;
            }
        } else {
            player[node] = new VimeoPlayer(node, option);
            vimeoEvents(player[node]);
        }
    }
    /**
     * Plays the video using the Vimeo player instance.
     * If the player is not initialized, logs an error to the console.
     */
    play() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].play();
        this.paused = false;
    }
    /**
     * Pauses the Vimeo player.
     *
     * This method calls the `pause` function on the `player` object to pause the video playback.
     */
    async pause() {
        if (!player[this.node]) {
            return false;
        }
        await player[this.node].pause();
        this.paused = true;
        return true;
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
        player[this.node].setCurrentTime(starttime);
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
        this.ended = false;
        await player[this.node].setCurrentTime(time);
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
        return player[this.node].getCurrentTime();
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
     * Checks if the Vimeo player is paused.
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
        const paused = await player[this.node].getPaused();
        return paused;
    }
    /**
     * Checks if the Vimeo player is currently playing.
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
        const paused = await player[this.node].getPaused();
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
        if (!player[this.node]) {
            return false;
        }
        if (this.ended) {
            return true;
        }
        const ended = await player[this.node].getEnded();
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
        const width = await player[this.node].getVideoWidth();
        const height = await player[this.node].getVideoHeight();

        return width / height;
    }
    /**
     * Destroys the Vimeo player instance if it is initialized.
     * If the player is not initialized, logs an error message to the console.
     */
    destroy() {
        if (player[this.node]) {
            player[this.node].destroy();
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
        const paused = await player[this.node].getPaused();
        return paused ? 'paused' : 'playing';
    }
    /**
     * Sets the playback rate for the Vimeo player.
     *
     * @param {number} rate - The desired playback rate.
     *                        This should be a value supported by the Vimeo player.
     */
    setRate(rate) {
        if (!player[this.node]) {
            return;
        }
        player[this.node].setPlaybackRate(rate);
    }
    /**
     * Mutes the Vimeo player by setting the volume to 0.
     */
    mute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].setVolume(0);
    }
    /**
     * Unmutes the Vimeo player by setting the volume to 1.
     */
    unMute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].setVolume(1);
    }

    async isMuted() {
        if (!player[this.node]) {
            return false;
        }
        const volume = await player[this.node].getVolume();
        return volume === 0;
    }

    /**
     * Set quality of the video
     * @param {String} quality
     */
    setQuality(quality) {
        if (!player[this.node]) {
            return quality;
        }
        player[this.node].setQuality(quality);
        return quality;
    }
    /**
     * Get the available qualities of the video
     */
    async getQualities() {
        if (!player[this.node]) {
            return null;
        }
        let qualities = await player[this.node].getQualities();
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
        if (!player[this.node]) {
            return null;
        }
        if (track != '') {
            player[this.node].enableTextTrack(track);
        } else {
            player[this.node].disableTextTrack();
        }
        return track;
    }

    /**
     * Returns the original Vimeo player instance.
     *
     * @returns {Object} The Vimeo player instance.
     */
    originalPlayer() {
        return player[this.node];
    }
}

export default Vimeo;