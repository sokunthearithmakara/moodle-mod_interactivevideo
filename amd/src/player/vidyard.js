
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
 * Vidyard Player class
 * Doc: https://knowledge.vidyard.com/hc/en-us/articles/360019034753-Using-the-Vidyard-Player-API
 * @module     mod_interactivevideo/player/vidyard
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

var player = {};
class Vidyard {
    /**
     * Constructor of the Vidyard player.
     */
    constructor() {
        this.useAnimationFrame = false;
        this.type = 'vidyard';
        this.frequency = 0.25;
        this.support = {
            playbackrate: true,
            quality: false,
        };
    }

    async getInfo(url, node) {
        this.node = node;
        let self = this;
        // URL: https://share.vidyard.com/watch/6xY4kDZfFJw8nmfHitJzdJ
        let regex = /(?:https?:\/\/)?(?:share\.vidyard\.com)\/watch\/([a-zA-Z0-9]+)/i;
        var match = regex.exec(url);
        var videoId = match ? match[1] : null;
        this.videoId = videoId;

        // Load the Dyntube API script.
        var tag = document.createElement('script');
        tag.src = "https://play.vidyard.com/embed/v4.js";
        tag.async = true;
        tag.as = "script";
        tag.rel = "preload";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        $(`#${node}`).attr({
            'data-uuid': videoId,
            'data-v': '4',
            'data-type': 'inline',
            'data-autoplay': '0',
            'data-viral_sharing': '0',
            'data-embed_button': '0',
            'data-hide_playlist': '1',
            'data-name_overlay': '0',
        }).addClass('vidyard-player-embed');

        return new Promise((resolve) => {
            window.onVidyardAPI = (vidyardEmbed) => {
                vidyardEmbed.api.addReadyListener((_, pl) => {
                    player[node] = pl;
                    // Put your code here.
                    $(pl.container).attr('id', node); // Container id got removed by vidyard. We need to set it again.
                    $(pl.container).parent().removeClass('audio'); // For some reason, vidyard adds audio class to the container.
                    let targetvideo = pl.metadata.chapters_attributes[0].video_attributes;
                    self.targetvideo = targetvideo;
                    self.title = targetvideo.name;
                    self.posterImage = targetvideo.thumbnail_urls.normal;
                    resolve({
                        duration: targetvideo.length_in_seconds,
                        title: self.title,
                        posterImage: self.posterImage,
                    });
                });
            };
        });
    }

    /**
     * Creates an instance of the Vidyard player.
     *
     * @constructor
     * @param {string} url - The URL of the Vidyard video.
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
            dispatchEvent('iv:autoplayBlocked', {
                requireVideoBlock: true,
            });
        }

        let self = this;
        let ready = false;

        // URL: https://share.vidyard.com/watch/6xY4kDZfFJw8nmfHitJzdJ
        let regex = /(?:https?:\/\/)?(?:share\.vidyard\.com)\/watch\/([a-zA-Z0-9]+)/i;
        var match = regex.exec(url);
        var videoId = match ? match[1] : null;
        this.videoId = videoId;

        // Load the Dyntube API script.
        var tag = document.createElement('script');
        tag.src = "https://play.vidyard.com/embed/v4.js";
        tag.async = true;
        tag.as = "script";
        tag.rel = "preload";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        $(`#${node}`).attr({
            'data-uuid': videoId,
            'data-v': '4',
            'data-type': 'inline',
            'data-autoplay': '0',
            'data-second': start || 0,
            'data-hidden_controls': showControls ? '0' : '1',
            'data-viral_sharing': '0',
            'data-embed_button': '0',
            'data-hide_playlist': '1',
            'data-name_overlay': '0',
        }).addClass('vidyard-player-embed');

        window.onVidyardAPI = (vidyardEmbed) => {
            vidyardEmbed.api.addReadyListener((_, pl) => {
                player[node] = pl;
                // Put your code here.
                $(pl.container).attr('id', node); // Container id got removed by vidyard. We need to set it again.
                $(pl.container).parent().removeClass('audio'); // For some reason, vidyard adds audio class to the container.
                let targetvideo = pl.metadata.chapters_attributes[0].video_attributes; // Make sure we're playing the first video.
                self.targetvideo = targetvideo;
                self.title = targetvideo.name;
                self.start = start || 0;
                let totaltime = Number(targetvideo.length_in_seconds.toFixed(2)) - self.frequency;
                end = !end ? totaltime : Math.min(end, totaltime);
                end = Number(end.toFixed(2));
                self.end = end;
                self.totaltime = Number(totaltime.toFixed(2));
                self.duration = self.end - self.start;
                self.posterImage = targetvideo.thumbnail_urls.normal;

                player[node].disableCaption();
                let tracks = [];
                if (targetvideo.captions.length > 0) {
                    targetvideo.captions.forEach((track) => {
                        tracks.push({
                            label: track.name,
                            code: track.language
                        });
                    });
                    dispatchEvent('iv:playerLoaded', {'tracks': tracks, 'reloaded': reloaded});
                }
                player[node].on('ready', function() {
                    let $div = $(pl.container).find('.vidyard-div-' + videoId + '[role="region"]');
                    self.aspectratio = $div[0].style['padding-bottom'].replace('%', '') / 100;
                    self.aspectratio = 1 / self.aspectratio;

                    ready = true;
                    dispatchEvent('iv:playerReady', null, document.getElementById(node));

                    setTimeout(() => {
                        $('.video-block, #video-block').addClass('no-pointer bg-transparent');
                    }, 1000);
                });

                player[node].on('play', function() {
                    self.paused = false;
                    dispatchEvent('iv:playerPlay');
                });

                player[node].on('pause', function() {
                    self.paused = true;
                    dispatchEvent('iv:playerPaused');
                });

                player[node].on('videoComplete', async function() {
                    self.ended = true;
                    if (pl.metadata.chapters_attributes.length > 1) {
                        player[node].playVideoAtIndex(0);
                        player[node].pause();
                    }
                    player[node].seek(self.start);
                    dispatchEvent('iv:playerEnded');
                });

                player[node].on('timeupdate', function(e) {
                    if (!ready) {
                        return;
                    }
                    if (e > self.end) {
                        self.ended = true;
                        self.paused = true;
                        player[node].seek(self.start);
                        player[node].pause();
                        dispatchEvent('iv:playerEnded');
                        return;
                    }
                    if (e < self.start) {
                        player[node].seek(self.start);
                    }
                    self.paused = false;
                    self.ended = false;
                    dispatchEvent('iv:playerPlaying');
                });

                player[node].on('volumechange', function(e) {
                    dispatchEvent('iv:playerVolumeChange', {volume: e.volume});
                });
            }, videoId);
        };
    }

    /**
     * Play the video
     * @return {Void}
     */
    play() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].play();
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
        player[this.node].pause();
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
        player[this.node].seek(starttime);
        player[this.node].pause();
    }
    /**
     * Seek the video to a specific time
     * @param {Number} time
     * @return {Promise<Boolean>}
     */
    async seek(time) {
        if (!player[this.node]) {
            return time;
        }
        let currentTime = player[this.node].currentTime();
        dispatchEvent('iv:playerSeekStart', {time: currentTime});
        this.ended = false;
        return new Promise((resolve) => {
            player[this.node].seek(time, true);
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
        return player[this.node].currentTime();
    }
    /**
     * Get the duration of the video
     * @return {Number}
     */
    getDuration() {
        if (!player[this.node]) {
            return 0;
        }
        return this.targetvideo.length_in_seconds;
    }
    /**
     * Check if the video is paused
     * @return {Boolean}
     */
    isPaused() {
        if (!player[this.node]) {
            return true;
        }
        return this.paused;
    }
    /**
     * Check if the video is playing
     * @return {Boolean}
     */
    isPlaying() {
        if (!player[this.node]) {
            return false;
        }
        return !this.paused;
    }
    /**
     * Check if the video is ended
     * @return {Boolean}
     */
    isEnded() {
        if (!player[this.node]) {
            return false;
        }
        return this.ended;
    }
    /**
     * Get the aspect ratio of the video
     * @return {Number}
     */
    ratio() {
        if (!player[this.node]) {
            return 16 / 9;
        }
        return this.aspectratio;
    }
    /**
     * Destroy the player
     * @return {Void}
     */
    destroy() {
        $(`#${this.node}`).remove();
        player[this.node] = null;
        dispatchEvent('iv:playerDestroyed');
    }
    /**
     * Get the state of the player
     * @return {Number}
     */
    getState() {
        if (!player[this.node]) {
            return 'paused';
        }

        return this.paused ? 'paused' : 'playing';
    }
    /**
     * Set playback rate of the video
     * @param {Number} rate
     */
    setRate(rate) {
        if (!player[this.node]) {
            return rate;
        }
        player[this.node].setPlaybackSpeed(rate);
        return rate;
    }
    /**
     * Mute the video
     */
    mute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].setVolume(0);
        this.muted = true;
        dispatchEvent('iv:playerVolumeChange', {volume: 0});
    }
    /**
     * Unmute the video
     */
    unMute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].setVolume(1);
        this.muted = false;
        dispatchEvent('iv:playerVolumeChange', {volume: 1});
    }

    isMuted() {
        if (!player[this.node]) {
            return false;
        }
        return this.muted;
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
        if (!track || track === '') {
            player[this.node].disableCaption();
            return;
        }
        player[this.node].enableCaption(track);
    }
}

export default Vidyard;