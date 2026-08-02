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
 * Shared enable content types admin modal (Interactive Video and Flexbook).
 *
 * @module     mod_interactivevideo/contenttypes_settings
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define([
    'jquery',
    'core/modal_events',
    'core/ajax',
    'core/str',
    'core/templates',
    'core/notification',
], function($, modalEvents, Ajax, Str, Templates, Notification) {

    /** @type {object|null} Active plugin configuration */
    let pluginConfig = null;

    /** @type {object|null} Catalog for the current open modal session */
    let modalCatalog = null;

    /** @type {object|null} Cached modal module (core/modal or core/modal_factory) */
    let ModalFactory = null;

    /**
     * Whether the active theme uses Bootstrap 5.
     *
     * @return {boolean}
     */
    const isBS5 = () => $('body').hasClass('bs-5');

    /**
     * Resolve the Moodle branch for modal API selection.
     *
     * @return {number}
     */
    const getMoodleBranch = () => {
        window.M = window.M || {};
        if (window.M.version) {
            return Number(window.M.version);
        }

        const ivbranch = $('#iv-m-version').data('value');
        if (ivbranch) {
            window.M.version = ivbranch;
            return Number(ivbranch);
        }

        const fbbranch = $('#mod_flexbook_moodle_version').attr('data-version');
        if (fbbranch) {
            window.M.version = fbbranch;
            return Number(fbbranch);
        }

        if (typeof M !== 'undefined' && M.cfg && M.cfg.branch) {
            window.M.version = M.cfg.branch;
            return Number(M.cfg.branch);
        }
        return 403;
    };

    /**
     * Resolve the Modal class from an AMD module export.
     *
     * @param {object} modalModule
     * @return {object}
     */
    const resolveModalClass = (modalModule) => {
        if (modalModule && typeof modalModule.create === 'function') {
            return modalModule;
        }
        if (modalModule && modalModule.default && typeof modalModule.default.create === 'function') {
            return modalModule.default;
        }
        throw new Error('Unable to resolve modal module');
    };

    /**
     * Load core/modal or core/modal_factory depending on Moodle branch / theme.
     *
     * @return {Promise<object>}
     */
    const getModalClass = async() => {
        if (!ModalFactory) {
            const branch = getMoodleBranch();
            if (branch >= 403 || isBS5()) {
                ModalFactory = await import('core/modal');
            } else {
                ModalFactory = await import('core/modal_factory');
            }
        }
        return resolveModalClass(ModalFactory);
    };

    /**
     * Load bootstrap icons stylesheet once.
     *
     * @return {Promise<void>}
     */
    const loadBootstrapIcons = () => new Promise((resolve) => {
        const id = 'iv-bootstrap-icons-css';
        if (document.getElementById(id)) {
            resolve();
            return;
        }
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = `${M.cfg.wwwroot}/mod/interactivevideo/libraries/bootstrap-icons/bootstrap-icons.min.css`;
        link.onload = () => resolve();
        link.onerror = () => resolve();
        document.head.appendChild(link);
    });

    /**
     * Parse enabled components from textarea value.
     *
     * @param {string} value
     * @return {Set<string>}
     */
    const parseEnabled = (value) => {
        if (!value || !value.trim()) {
            return new Set();
        }
        return new Set(value.split(',').map((v) => v.trim()).filter(Boolean));
    };

    /**
     * Escape HTML for safe insertion.
     *
     * @param {string} text
     * @return {string}
     */
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text ?? '';
        return div.innerHTML;
    };

    /**
     * Type badge (Free / Pro) from catalog entry.
     *
     * @param {object|null} catalog
     * @param {object} strings
     * @return {string}
     */
    const renderTypeBadge = (catalog, strings) => {
        if (!catalog || !catalog.type) {
            return '';
        }
        if (catalog.type === 'paid') {
            return `<span class="badge iv-badge-success">Pro</span>`;
        }
        return `<span class="badge iv-badge-secondary">${escapeHtml(strings.free)}</span>`;
    };

    /**
     * Whether an installed row represents a paid content type.
     *
     * @param {object} row Installed plugin row.
     * @param {object|null} catalog Matching catalog entry when available.
     * @return {boolean}
     */
    const isPaidRow = (row, catalog) => {
        if (catalog && catalog.type) {
            return catalog.type === 'paid';
        }
        return !!row.paid;
    };

    /**
     * Type badge (Free / Pro) for an installed row.
     *
     * @param {object} row Installed plugin row.
     * @param {object|null} catalog Matching catalog entry when available.
     * @param {object} strings Lang strings.
     * @return {string}
     */
    const renderTypeBadgeForRow = (row, catalog, strings) => {
        if (catalog && catalog.type) {
            return renderTypeBadge(catalog, strings);
        }
        if (row.paid) {
            return `<span class="badge iv-badge-success">Pro</span>`;
        }
        return '';
    };

    /**
     * Activation badge for paid installed rows.
     *
     * @param {object} row Installed plugin row.
     * @param {object|null} catalog Matching catalog entry when available.
     * @param {object} strings Lang strings.
     * @return {string}
     */
    const renderActivationBadge = (row, catalog, strings) => {
        if (!isPaidRow(row, catalog)) {
            return '';
        }
        const activated = (catalog && typeof catalog.activated !== 'undefined')
            ? !!catalog.activated
            : !!row.activated;
        if (activated) {
            return `<span class="badge iv-badge-success iv-enablecontenttypes-activation">`
                + `${escapeHtml(strings.activated)}</span>`;
        }
        return `<span class="badge iv-badge-warning iv-enablecontenttypes-activation">`
            + `${escapeHtml(strings.notactivated)}</span>`;
    };

    /**
     *
     * @param {Array} installed
     * @param {Set<string>} enabled
     * @param {Array|null} catalogplugins
     * @param {object} strings
     * @return {string}
     */
    const renderInstalledRows = (installed, enabled, catalogplugins, strings) => {
        const catalogmap = {};
        if (catalogplugins) {
            catalogplugins.forEach((plugin) => {
                catalogmap[plugin.component] = plugin;
            });
        }

        let html = '';
        installed.forEach((row) => {
            const checked = enabled.has(row.component) ? 'checked' : '';
            const catalog = catalogmap[row.component];
            const typebadge = renderTypeBadgeForRow(row, catalog, strings);
            const activationbadge = renderActivationBadge(row, catalog, strings);

            let update = '';
            if (catalog && catalog.updateavailable) {
                if (catalog.updatelink) {
                    update = `<a href="${escapeHtml(catalog.updatelink)}"`
                        + ` class="badge iv-badge-success iv-enablecontenttypes-update" target="_blank" rel="noopener">`
                        + `${escapeHtml(strings.updateavailable)}</a>`;
                } else {
                    update = `<span class="badge iv-badge-warning iv-enablecontenttypes-update">`
                        + `${escapeHtml(strings.updateavailablelabel)}</span>`;
                }
            }

            const version = row.version
                ? `<span class="iv-enablecontenttypes-version small text-muted">${escapeHtml(row.version)}</span>` : '';

            const description = row.description
                ? `<p class="iv-font-weight-light mb-0 text-muted">${escapeHtml(row.description)}</p>`
                : '';
            const alignclass = row.description ? 'align-items-start' : 'align-items-center';

            html += `<label class="iv-enablecontenttypes-row dropdown-item text-wrap p-3 border-bottom`
                + ` d-flex w-100 ${alignclass} mb-0" data-title="${escapeHtml(row.title.toLowerCase())}">`
                + `<span class="iv-enablecontenttypes-checkwrap">`
                + `<input type="checkbox" class="iv-enablecontenttypes-check"`
                + ` value="${escapeHtml(row.component)}" ${checked}>`
                + `</span>`
                + `<i class="iv-enablecontenttypes-icon ${escapeHtml(row.icon)}" aria-hidden="true"></i>`
                + `<div class="w-100 iv-enablecontenttypes-info">`
                + `<div class="iv-enablecontenttypes-head">`
                + `<div class="iv-enablecontenttypes-head-main">`
                + `<span class="iv-enablecontenttypes-title iv-font-weight-bold">${escapeHtml(row.title)}</span>`
                + `${typebadge}`
                + `</div>`
                + `<div class="iv-enablecontenttypes-head-actions">`
                + `${activationbadge}${update}${version}`
                + `</div></div>${description}</div></label>`;
        });
        return html;
    };

    /**
     * Build More tab rows HTML (catalog entries not yet installed).
     *
     * @param {Array} plugins
     * @param {object} strings
     * @return {string}
     */
    const renderMoreRows = (plugins, strings) => {
        const notinstalled = (plugins || []).filter((plugin) => !plugin.installed);
        if (notinstalled.length === 0) {
            return `<div class="text-muted text-center p-4">${escapeHtml(strings.moreempty)}</div>`;
        }

        let html = '';
        notinstalled.forEach((plugin) => {
            const typebadge = renderTypeBadge(plugin, strings);
            const searchtext = `${plugin.title || ''} ${plugin.description || ''}`.toLowerCase();
            const downloadurl = plugin.download_url || plugin.git || '';
            const title = downloadurl
                ? `<a href="${escapeHtml(downloadurl)}"`
                    + ` class="iv-enablecontenttypes-title iv-enablecontenttypes-titlelink iv-font-weight-bold"`
                    + ` target="_blank" rel="noopener">${escapeHtml(plugin.title)}</a>`
                : `<span class="iv-enablecontenttypes-title iv-font-weight-bold">${escapeHtml(plugin.title)}</span>`;

            const desc = plugin.description
                ? `<p class="iv-font-weight-light mb-0 text-muted">${escapeHtml(plugin.description)}</p>` : '';
            const alignclass = plugin.description ? 'align-items-start' : 'align-items-center';

            html += '<div class="iv-enablecontenttypes-row iv-enablecontenttypes-row--more dropdown-item text-wrap'
                + ` py-3 px-5 border-bottom d-flex w-100 ${alignclass}"`
                + ` data-title="${escapeHtml(searchtext)}">`
                + `<i class="iv-enablecontenttypes-icon ${escapeHtml(plugin.icon || 'bi bi-plug')}" aria-hidden="true"></i>`
                + `<div class="w-100 iv-enablecontenttypes-info">`
                + `<div class="iv-enablecontenttypes-head">`
                + `<div class="iv-enablecontenttypes-head-main">${title}</div>`
                + `<div class="iv-enablecontenttypes-head-actions">${typebadge}</div>`
                + `</div>${desc}</div></div>`;
        });
        return html;
    };

    /**
     * Apply search filter to visible panel rows.
     *
     * @param {JQuery} root
     * @param {string} query
     */
    const filterRows = (root, query) => {
        const q = query.trim().toLowerCase();
        root.find('.iv-enablecontenttypes-panel:not(.d-none) .iv-enablecontenttypes-row').each(function() {
            const title = $(this).attr('data-title') || '';
            $(this).toggleClass('d-none', q !== '' && !title.includes(q));
        });
    };

    /**
     * Fetch catalog via web service (refetch each modal open).
     *
     * @return {Promise<object>}
     */
    const fetchCatalog = async() => {
        const response = await Ajax.call([{
            methodname: pluginConfig.wsMethod,
            args: {
                ...(pluginConfig.wsArgs || {}),
                refresh: true,
            },
        }])[0];
        return JSON.parse(response.catalog);
    };

    /**
     * Destroy a modal instance (core/modal and legacy modal_factory).
     *
     * @param {object} modal
     */
    const destroyModal = (modal) => {
        if (modal && typeof modal.destroy === 'function') {
            modal.destroy();
        }
    };

    /**
     * Open the enable content types modal.
     *
     * @param {HTMLElement} trigger
     */
    const openModal = async(trigger) => {
        await loadBootstrapIcons();
        modalCatalog = null;

        const installednode = document.getElementById(pluginConfig.installedNodeId);
        const installed = installednode ? JSON.parse(installednode.textContent || '[]') : [];
        const enabled = parseEnabled($('[name="' + pluginConfig.textareaName + '"]').val() || '');
        const stringcomponent = pluginConfig.stringComponent || 'mod_interactivevideo';

        const strings = await Str.get_strings([
            {key: 'updateavailable', component: stringcomponent},
            {key: 'contenttypeupdateavailable', component: stringcomponent},
            {key: 'contenttypescatalogerror', component: stringcomponent},
            {key: 'contenttypefree', component: stringcomponent},
            {key: 'contenttypesmoreempty', component: stringcomponent},
            {key: 'contenttypeactivated', component: stringcomponent},
            {key: 'contenttypenotactivated', component: stringcomponent},
        ]).catch(() => ([
            'Download update', 'Update available', 'Could not load the content types catalog.',
            'Free', 'No additional content types to show.', 'Activated', 'Not activated',
        ]));

        const [
            updateavailable, updateavailablelabel, catalogerror,
            free, moreempty, activated, notactivated,
        ] = strings;
        const stringmap = {
            updateavailable,
            updateavailablelabel,
            free,
            moreempty,
            activated,
            notactivated,
        };

        const shellhtml = await Templates.render(pluginConfig.modalTemplate, {});
        const contenthtml = $('<div>').html(shellhtml).find('.modal-content').html();
        if (!contenthtml) {
            throw new Error('Enable content types modal template failed to render');
        }

        const ModalClass = await getModalClass();
        const modalConfig = {
            title: '',
            body: '',
            show: false,
            large: true,
            isVerticallyCentered: true,
            removeOnClose: true,
        };
        if (trigger) {
            modalConfig.returnElement = trigger;
        }

        const modal = await ModalClass.create(modalConfig);

        const root = modal.getRoot();
        root.addClass('iv-enablecontenttypes-modal');
        if (isBS5()) {
            root.addClass('bs-5');
        }
        root.find('.modal-dialog').addClass('modal-dialog-scrollable');
        root.find('.modal-dialog .modal-content').html(contenthtml);

        const $installedPanel = root.find('[data-panel="installed"]');
        const $morePanel = root.find('[data-panel="more"]');
        $installedPanel.html(renderInstalledRows(installed, enabled, null, stringmap));

        const setTab = (tab) => {
            root.find('.iv-enablecontenttypes-tabs .nav-link').removeClass('active').attr('aria-selected', 'false');
            root.find(`.iv-enablecontenttypes-tabs .nav-link[data-tab="${tab}"]`).addClass('active').attr('aria-selected', 'true');
            root.find('.iv-enablecontenttypes-panel').addClass('d-none');
            root.find(`[data-panel="${tab}"]`).removeClass('d-none');
            filterRows(root, root.find('.iv-enablecontenttypes-search').val() || '');
        };

        const refreshInstalledUpdates = () => {
            if (!modalCatalog || !modalCatalog.subplugins) {
                return;
            }
            $installedPanel.find('.iv-enablecontenttypes-check').each(function() {
                const component = $(this).val();
                if ($(this).is(':checked')) {
                    enabled.add(component);
                } else {
                    enabled.delete(component);
                }
            });
            $installedPanel.html(renderInstalledRows(installed, enabled, modalCatalog.subplugins, stringmap));
            filterRows(root, root.find('.iv-enablecontenttypes-search').val() || '');
        };

        root.on('change', '.iv-enablecontenttypes-check', function() {
            const component = $(this).val();
            if ($(this).is(':checked')) {
                enabled.add(component);
            } else {
                enabled.delete(component);
            }
        });

        const loadCatalog = async() => {
            if (modalCatalog) {
                return modalCatalog;
            }
            try {
                modalCatalog = await fetchCatalog();
                $morePanel.find('.iv-enablecontenttypes-loading').remove();
                $morePanel.append(
                    `<div class="iv-enablecontenttypes-list">${renderMoreRows(modalCatalog.subplugins || [], stringmap)}</div>`
                );
                refreshInstalledUpdates();
            } catch (e) {
                $morePanel.html(`<div class="alert alert-warning m-3">${escapeHtml(catalogerror)}</div>`);
            }
            return modalCatalog;
        };

        root.on('click', '.iv-enablecontenttypes-tabs .nav-link', function(e) {
            e.preventDefault();
            const tab = $(this).data('tab');
            setTab(tab);
            if (tab === 'more') {
                loadCatalog();
            }
        });

        root.on('input', '.iv-enablecontenttypes-search', function() {
            filterRows(root, $(this).val() || '');
        });

        const closeModal = () => {
            modal.hide();
        };

        root.on('click', '.iv-enablecontenttypes-close, .iv-enablecontenttypes-cancel', function(e) {
            e.preventDefault();
            closeModal();
        });

        root.on('click', '.iv-enablecontenttypes-save', async function(e) {
            e.preventDefault();
            const selected = [];
            $installedPanel.find('.iv-enablecontenttypes-check:checked').each(function() {
                selected.push($(this).val());
            });
            $('[name="' + pluginConfig.textareaName + '"]').val(selected.join(','));
            const summary = await Str.get_string('contenttypesenabledcount', stringcomponent, {
                enabled: selected.length,
                total: installed.length,
            });
            $('.iv-enablecontenttypes-summary').text(summary);
            closeModal();
        });

        root.on(modalEvents.hidden, function() {
            modalCatalog = null;
            destroyModal(modal);
        });

        modal.show();
        setTab('installed');
        loadCatalog();
    };

    /**
     * Initialise settings page handlers.
     *
     * @param {object} config Plugin-specific configuration.
     */
    const init = (config) => {
        pluginConfig = config;
        const selector = 'button[name="enablecontenttypes"]';
        const namespace = config.clickNamespace || 'ivcontenttypes';

        $(document).off(`click.${namespace}`, selector);
        $(document).on(`click.${namespace}`, selector, async function(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            try {
                await openModal(this);
            } catch (error) {
                Notification.exception(error);
            }
        });
    };

    return {init};
});
