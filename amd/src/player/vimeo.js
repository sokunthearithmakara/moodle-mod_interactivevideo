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
 * Documented at https://developer.vimeo.com/player/sdk/reference or https://github.com/vimeo/player.js
 * @module     mod_interactivevideo/player/vimeo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';
import fetchOembed from 'mod_interactivevideo/player/oembed';

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

    /**
     * Extract a Vimeo video id and optional hash from a supported URL.
     *
     * @param {string} url Vimeo URL.
     * @return {Object}
     */
    getVideoData(url) {
        try {
            const parsed = new URL(url);
            const path = parsed.pathname.split('/').filter(Boolean);
            let id = '';
            let hash = parsed.searchParams.get('h') || '';
            if (parsed.hostname === 'player.vimeo.com' && path[0] === 'video') {
                id = path[1] || '';
            } else {
                id = path[0] || '';
                hash = hash || path[1] || '';
            }
            return {id, hash};
        } catch {
            const match = /(?:https?:\/\/)?(?:www\.)?(?:vimeo\.com)\/([^/?#]+)(?:\/([^/?#]+))?/.exec(url);
            return {
                id: match ? match[1] : '',
                hash: match && match[2] ? match[2] : '',
            };
        }
    }

    /**
     * Build a direct Vimeo iframe URL so player.js does not resolve page URLs through oEmbed.
     *
     * @param {string} url Vimeo URL.
     * @param {Object} params Embed parameters.
     * @return {string}
     */
    getIframeUrl(url, params = {}) {
        const video = this.getVideoData(url);
        const search = new URLSearchParams();
        if (video.hash) {
            search.set('h', video.hash);
        }
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                search.set(key, value);
            }
        });
        return `https://player.vimeo.com/video/${video.id}?${search.toString()}`;
    }

    /**
     * Replace the target node with a Vimeo iframe.
     *
     * @param {string} node Target node id.
     * @param {string} src Iframe source.
     */
    setIframe(node, src) {
        const iframe = document.createElement('iframe');
        iframe.id = node;
        iframe.src = src;
        iframe.width = '1080';
        iframe.height = '720';
        iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin';
        iframe.setAttribute('frameborder', '0');
        document.getElementById(node).replaceWith(iframe);
    }

    async getInfo(url, node) {
        this.node = node;
        const _this = this;
        return new Promise((resolve) => {
            let VimeoPlayer;
            const iframeUrl = this.getIframeUrl(url, {
                width: 1080,
                height: 720,
                dnt: true,
            });
            const vimeoEvents = (player) => {
                player.on('loaded', async function() {
                    let title = await player.getVideoTitle();
                    let duration = await player.getDuration();
                    // Get poster image using oEmbed.
                    var posterUrl = 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(url);
                    let posterImage = '';
                    try {
                        const oEmbedData = await fetchOembed(posterUrl);
                        if (oEmbedData.domain_status_code !== 403 && !oEmbedData.error) {
                            posterImage = oEmbedData.thumbnail_url || '';
                        }
                    } catch {
                        // Vimeo may block oEmbed by network policy. The player API still provides the core metadata.
                    }
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
                        _this.setIframe(node, iframeUrl);
                        player[node] = new Player(document.getElementById(node));
                        vimeoEvents(player[node]);
                    });
                } catch (e) {
                    _this.sendEvent('iv:playerError', {error: e.message}, _this.node);
                    return;
                }
            } else {
                _this.setIframe(node, iframeUrl);
                player[node] = new VimeoPlayer(document.getElementById(node));
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
        const _this = this;
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            _this.sendEvent('iv:autoplayBlocked', null, _this.node);
        }
        this.start = start;
        let VimeoPlayer;
        this.aspectratio = 16 / 9;
        // Get poster image using oEmbed.
        var posterUrl = 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(url);
        this.posterImage = '';
        this.title = '';
        this.videoId = '';
        try {
            const oEmbedData = await fetchOembed(posterUrl);
            if (oEmbedData.domain_status_code !== 403 && !oEmbedData.error) {
                this.posterImage = oEmbedData.thumbnail_url || '';
                this.title = oEmbedData.title;
                this.videoId = oEmbedData.video_id;
                // Change the dimensions of the poster image to 16:9.
                this.posterImage = this.posterImage.replace(/_\d+x\d+/, '_720x405');
                this.aspectratio = oEmbedData.width / oEmbedData.height;
            }
        } catch {
            // Vimeo may block oEmbed by network policy. Continue with the player API.
        }
        document.getElementById('video-wrapper').style.display = 'block';
        if (!this.videoId) {
            this.videoId = this.getVideoData(url).id;
        }
        let self = this;
        const iframeUrl = this.getIframeUrl(url, {
            width: 1080,
            height: 720,
            autoplay: !showControls ? 1 : 0,
            controls: showControls ? 1 : 0,
            loop: 0,
            muted: 1,
            playsinline: 1,
            background: 0,
            byline: 0,
            portrait: 0,
            title: 0,
            transparent: 0,
            responsive: 0,
            pip: 0,
            fullscreen: 0,
            keyboard: 0,
            dnt: 1,
            chapters: showControls ? 1 : 0,
            interactive_markers: showControls ? 1 : 0,
            vimeo_logo: 0,
            quality: '360p',
        });

        let ready = false;
        const vimeoEvents = (player) => {
            player.on('loaded', async function() {
                const iframe = document.getElementById(node);
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
                        _this.sendEvent('iv:playerLoaded', {
                            tracks: tracks,
                            qualities: self.getQualities(),
                            reloaded: reloaded,
                        }, _this.node);
                    }

                    ready = true;
                    self.sendEvent('iv:playerReady', null, self.node);
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
                        _this.sendEvent('iv:playerReady', null, _this.node);
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
                _this.sendEvent('iv:playerPlay', null, _this.node);
            });

            player.on('pause', function(e) {
                if (!ready) {
                    return;
                }
                self.paused = true;
                if (e.seconds >= end) {
                    self.ended = true;
                    _this.sendEvent('iv:playerEnded', null, _this.node);
                } else {
                    self.ended = false;
                    _this.sendEvent('iv:playerPaused', null, _this.node);
                }
            });

            player.on('timeupdate', async function(e) {
                if (!ready) {
                    return;
                }
                if (e.seconds >= end) {
                    self.ended = true;
                    self.paused = true;
                    _this.sendEvent('iv:playerEnded', null, _this.node);
                } else if (await player.getPaused()) {
                    self.paused = true;
                    _this.sendEvent('iv:playerPaused', null, _this.node);
                } else {
                    self.paused = false;
                    self.ended = false;
                    _this.sendEvent('iv:playerPlaying', null, _this.node);
                }
            });

            player.on('playbackratechange', function(e) {
                if (!ready) {
                    return;
                }
                _this.sendEvent('iv:playerRateChange', {rate: e.playbackRate}, _this.node);
            });

            player.on('ended', function() {
                if (!ready) {
                    return;
                }
                self.ended = true;
                self.paused = true;
                _this.sendEvent('iv:playerEnded', null, _this.node);
            });

            player.on('qualitychange', function(e) {
                if (!ready) {
                    return;
                }
                _this.sendEvent('iv:playerQualityChange', {quality: e.quality}, _this.node);
            });

            player.on('error', function(e) {
                if (e.name === 'NotAllowedError') {
                    return;
                }
                if (e.method === 'appendVideoMetadata') {
                    return;
                }
                _this.sendEvent('iv:playerError', {error: e.message}, _this.node);
                if (!showControls) {
                    const $videoblock = document.querySelector('.video-block');
                    if ($videoblock) {
                        $videoblock.classList.remove('no-pointer');
                    }
                }
            });

            player.on('volumechange', function(e) {
                _this.sendEvent('iv:playerVolumeChange', {volume: e.volume}, _this.node);
            });
        };

        if (!VimeoPlayer) {
            try {
                    require(['https://player.vimeo.com/api/player.js'], function(Player) {
                        VimeoPlayer = Player;
                        _this.setIframe(node, iframeUrl);
                        player[node] = new Player(document.getElementById(node));
                        vimeoEvents(player[node]);
                    });
                } catch (e) {
                _this.sendEvent('iv:playerError', {error: e.message}, _this.node);
                return;
            }
        } else {
            _this.setIframe(node, iframeUrl);
            player[node] = new VimeoPlayer(document.getElementById(node));
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
        let currentTime = await this.getCurrentTime();
        this.sendEvent('iv:playerSeekStart', {time: currentTime}, this.node);
        await player[this.node].setCurrentTime(time);
        this.sendEvent('iv:playerSeek', {time: time}, this.node);
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
        const totaltime = Number(this.totaltime);
        if (Number.isFinite(totaltime)) {
            return totaltime;
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
        this.sendEvent('iv:playerDestroyed', null, this.node);
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

    /**
     * Helper to dispatch events safely.
     * @param {string} name
     * @param {object} details
     * @param {string} elementid
     */
    sendEvent(name, details = null, elementid = null) {
        // eslint-disable-next-line no-nested-ternary
        let el = elementid ? document.getElementById(elementid) : (this.node ? document.getElementById(this.node) : null);
        if (el) {
            dispatchEvent(name, details, el);
        } else {
            dispatchEvent(name, details);
        }
    }

}

export default Vimeo;
