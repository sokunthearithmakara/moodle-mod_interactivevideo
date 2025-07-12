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
 * PeerTube Player class
 * https://docs.joinpeertube.org/api/embed-player#embed-methods
 *
 * @module     mod_interactivevideo/player/peertube
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import {PeerTubePlayer} from 'mod_interactivevideo/libraries/peertube';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

let player = {};

class PeerTube {
    /**
     * Creates an instance of the PeerTube player.
     *
     * @constructor
     */
    constructor() {
        this.useAnimationFrame = false;
        /**
         * The type of the player
         * @type {String}
         * @default peertube
         * @private
         * @readonly
         */
        this.type = 'peertube';
        /**
         * Interval frequency
         * @type {Number}
         */
        this.frequency = 0.7;
        this.support = {
            playbackrate: true,
            quality: true,
            password: true,
        };
    }

    async getInfo(url, node) {
        this.node = node;
        let self = this;
        // Get the id and domain of the video.
        // Sample Url: https://video.hardlimit.com/w/hFwjKHQa3ixivePeqGc4KR
        const regex = /https:\/\/([^/]+)\/w\/([^/]+)/;
        const match = url.match(regex);
        const domain = match[1];
        const id = match[2];
        let videoId = id.split('?')[0];

        // Get the video info
        let password = url.split('?password=')[1];
        const myHeaders = new Headers();
        if (password && password !== '') {
            myHeaders.append("x-peertube-video-password", password);
        }
        let videoInfo = await fetch(`https://${domain}/api/v1/videos/${videoId}`, {
            method: 'GET',
            headers: myHeaders,
        });
        videoInfo = await videoInfo.json();
        self.duration = Number(videoInfo.duration.toFixed(2));
        self.title = videoInfo.name;
        self.videoId = videoInfo.uuid;
        self.posterImage = 'https://' + domain + videoInfo.thumbnailPath;

        let iframeURL = `https://${domain}${videoInfo.embedPath}?api=1&autoplay=0`;
        iframeURL += `&warningTitle=0&controls=1&peertubeLink=0&p2p=0&muted=0&controlBar=1&title=0`;
        if (password && password !== '') { // If the video is password protected. We need to pass the password to the embed API.
            iframeURL += `&waitPasswordFromEmbedAPI=1`;
        }
        $(`#${node}`)
            .replaceWith(`<iframe id="${node}" src="${iframeURL}" width="100%" height="100%" allow="autoplay"
             frameborder="0" allowfullscreen="" sandbox="allow-same-origin allow-scripts allow-popups allow-forms"></iframe>`);
        // Create the video element.
        player[node] = new PeerTubePlayer(document.getElementById(node));
        player[node].setVideoPassword(password); // Set the password for the video.
        await player[node].ready; // Wait for the player to be ready.

        player[node].addEventListener('playbackStatusUpdate', (status) => {
            self.currentTime = status.position;
        });
        return new Promise((resolve) => {
            resolve({
                duration: self.duration,
                title: self.title,
                posterImage: self.posterImage,
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
        this.start = start;
        this.node = node;

        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked');
            $('#video-block, .video-block').remove();
        }

        // Get the id and domain of the video.
        // Sample Url: https://video.hardlimit.com/w/hFwjKHQa3ixivePeqGc4KR
        const regex = /https:\/\/([^/]+)\/w\/([^/]+)/;
        const match = url.match(regex);
        const domain = match[1];
        const id = match[2];
        let videoId = id.split('?')[0];

        // Get the video info
        let password = url.split('?password=')[1];
        const myHeaders = new Headers();
        if (password && password !== '') {
            myHeaders.append("x-peertube-video-password", password);
        }
        let videoInfo = await fetch(`https://${domain}/api/v1/videos/${videoId}`, {
            method: 'GET',
            headers: myHeaders,
        });
        videoInfo = await videoInfo.json();
        if (videoInfo.code === 'video_requires_password' || videoInfo.code === 'incorrect_video_password') {
            // Show the password prompt.
            let string = videoInfo.code === 'video_requires_password' ? 'This video is password protected' : 'Incorrect password';
            // eslint-disable-next-line no-alert
            const pwd = window.prompt(string, "");
            if (pwd === null) {
                return false;
            }
            url = url.split('?password=')[0]; // Remove the old password from the url.
            this.load(url + '?password=' + pwd, start, end, opts);
            return false;
        }

        if (!videoInfo.duration) {
            // eslint-disable-next-line no-alert
            alert('The video is not available');
            return false;
        }
        let self = this;
        let ready = false;
        let videoFile = videoInfo.files.pop();
        this.aspectratio = 16 / 9;
        if (videoFile) {
            // Get width and height of the video
            let $vdo = $('<video>').attr('src', videoFile.fileDownloadUrl).attr('preload', 'metadata');
            $vdo.on('loadedmetadata', function() {
                self.aspectratio = this.videoWidth / this.videoHeight;
            });
        }
        const totaltime = Number(videoInfo.duration.toFixed(2)) - self.frequency;
        end = !end ? totaltime : Math.min(end, totaltime);
        end = Number(end.toFixed(2));
        self.end = end;
        self.totaltime = totaltime;
        self.duration = self.end - self.start;
        self.title = videoInfo.name;
        self.videoId = videoInfo.uuid;
        self.posterImage = 'https://' + domain + videoInfo.thumbnailPath;

        let iframeURL = `https://${domain}${videoInfo.embedPath}?api=1&autoplay=1&end=${end}&start=${start}`;
        iframeURL += `&warningTitle=0&controls=${showControls || !self.allowAutoplay
            ? 1 : 0}&peertubeLink=0&p2p=0&muted=0&controlBar=${showControls ? 1 : 0}&title=0`;
        if (password && password !== '') { // If the video is password protected. We need to pass the password to the embed API.
            iframeURL += `&waitPasswordFromEmbedAPI=1`;
        }
        $(`#${node}`)
            .replaceWith(`<iframe id="${node}" src="${iframeURL}" width="100%" height="100%" allow="autoplay"
             frameborder="0" allowfullscreen="" sandbox="allow-same-origin allow-scripts allow-popups allow-forms"></iframe>`);
        // Create the video element.
        player[node] = new PeerTubePlayer(document.getElementById(node));
        player[node].setVideoPassword(password); // Set the password for the video.
        await player[node].ready; // Wait for the player to be ready.
        player[node].pause();
        player[node].setVolume(0);
        player[node].seek(start);
        let captions = await player[node].getCaptions();
        if (captions.length > 0) {
            captions = captions.map((caption) => {
                return {
                    label: caption.label,
                    code: caption.id,
                };
            });
        }
        dispatchEvent('iv:playerLoaded', {
            tracks: captions, qualities: self.getQualities(),
            reloaded: reloaded,
        });

        let listener = (status) => {
            let currentTime = status.position;
            self.currentTime = currentTime;
            switch (status.playbackState) {
                case 'playing':
                    self.paused = false;
                    self.ended = false;
                    if (currentTime < self.start) {
                        self.seek(self.start);
                    }
                    dispatchEvent('iv:playerPlaying');
                    if (currentTime >= self.end) {
                        self.ended = true;
                        dispatchEvent('iv:playerEnded');
                    }
                    break;

                case 'ended':
                    if (!self.ended) {
                        self.ended = true;
                        dispatchEvent('iv:playerEnded');
                    }
                    self.paused = true;
                    break;
            }
        };

        player[node].addEventListener('playbackStatusChange', (status) => {
            if (!ready) {
                player[node].setVolume(0);
                return;
            }
            if (status === 'paused') {
                self.paused = true;
                dispatchEvent('iv:playerPaused');
            } else if (status === 'playing') {
                self.paused = false;
                dispatchEvent('iv:playerPlay');
            }
        });

        player[node].addEventListener('playbackStatusUpdate', (status) => {
            if (self.ended) {
                return;
            }
            if (!ready) {
                player[node].setVolume(0);
                // Peertube player remembers the last position of the video.
                // We need to make sure the video is at the start before dispatching the ready event.
                const goToStart = setInterval(() => {
                    if (status.position > self.start
                        || status.position >= self.end
                        || status.position <= self.start) {
                        clearInterval(goToStart);
                        player[node].seek(self.start);
                        player[node].pause();
                        ready = true;
                        dispatchEvent('iv:playerReady', null, document.getElementById(node));
                        player[node].setVolume(1);
                    }
                }, 100);
            } else {
                listener(status);
            }
        });

        player[node].addEventListener('volumeChange', function(e) {
            dispatchEvent('iv:playerVolumeChange', {volume: e});
        });

        return true;
    }

    async getQualities() {
        if (!player[this.node]) {
            return null;
        }
        let qualities = await player[this.node].getResolutions();
        if (qualities.length === 0) {
            return false;
        }
        let ids = qualities.map(q => q.id);
        let label = qualities.map(q => q.label);
        let active = qualities.find(q => q.active);
        return {
            qualities: ids,
            qualitiesLabel: label,
            currentQuality: active.id,
        };
    }

    /**
     * Sets the quality of the video player.
     *
     * @param {string} quality - The desired quality level for the video player.
     */
    async setQuality(quality) {
        if (!player[this.node]) {
            return quality;
        }
        await player[this.node].setResolution(quality);
        return quality;
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
            return false;
        }
        player[this.node].pause();
        this.paused = true;
        return true;
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
        this.ended = false;
        await player[this.node].seek(time);
        dispatchEvent('iv:playerSeek', {time: time});
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
        return this.currentTime;
    }
    /**
     * Get the duration of the video
     * @return {Number}
     */
    async getDuration() {
        if (!player[this.node]) {
            return 0;
        }
        return this.totaltime;
    }
    /**
     * Check if the video is paused
     * @return {Boolean}
     */
    async isPaused() {
        if (!player[this.node]) {
            return true;
        }
        return this.paused;
    }
    /**
     * Check if the video is playing
     * @return {Boolean}
     */
    async isPlaying() {
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
        if (this.ended) {
            return true;
        }
        return this.currentTime >= this.end;
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
        $(`#${this.node}`).remove(); // Remove the iframe.
        player[this.node].removeEventListener();
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
        return this.isPaused() ? 'paused' : 'playing';
    }
    /**
     * Set playback rate of the video
     * @param {Number} rate
     */
    async setRate(rate) {
        if (!player[this.node]) {
            return rate;
        }
        await player[this.node].setPlaybackRate(rate);
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
    }
    /**
     * Unmute the video
     */
    unMute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].setVolume(1);
    }

    async isMuted() {
        if (!player[this.node]) {
            return true;
        }
        let volume = await player[this.node].getVolume();
        return volume === 0;
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
    async setCaption(track) {
        if (!player[this.node]) {
            return;
        }
        await player[this.node].setCaption(track);
    }
}

export default PeerTube;
