/**
 * CryptoClient — Jupiter wallet only
 * Stripped from Avina's multi-wallet CryptoClient.
 * Supports: connect, disconnect, sign transactions, contract calls.
 */
class CryptoClient {
    // Only Jupiter wallet
    static WALLETS = {
        jupiter: {
            name: 'Jupiter',
            icon: 'jup-logo.webp',
            getProvider: () => CryptoClient.getJupiterProvider(),
            isInstalled: () => CryptoClient.isJupiterInstalled(),
            downloadUrl: 'https://jup.ag/'
        }
    };

    static STORAGE_KEY = 'cryptoClient_lastWallet';

    // Jupiter wallet detection using Wallet Standard
    static _jupiterWalletCache = null;
    static _walletStandardWallets = [];
    static _walletStandardInitialized = false;

    static initWalletStandard() {
        if (CryptoClient._walletStandardInitialized) return;
        CryptoClient._walletStandardInitialized = true;

        const register = (wallet) => {
            if (!CryptoClient._walletStandardWallets.find(w => w.name === wallet.name)) {
                CryptoClient._walletStandardWallets.push(wallet);
                console.log('[CryptoClient] Wallet Standard: registered', wallet.name);
                if (wallet.name?.toLowerCase().includes('jupiter')) {
                    CryptoClient._jupiterWalletCache = wallet;
                }
            }
        };

        CryptoClient._walletStandardRegister = register;

        window.addEventListener('wallet-standard:register-wallet', (event) => {
            register(event.detail);
        });

        CryptoClient.announceWalletStandardReady();
        setTimeout(() => CryptoClient.announceWalletStandardReady(), 100);
        setTimeout(() => CryptoClient.announceWalletStandardReady(), 500);
        setTimeout(() => CryptoClient.announceWalletStandardReady(), 1500);
    }

    static announceWalletStandardReady() {
        if (!CryptoClient._walletStandardRegister) return;

        window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', {
            detail: { register: CryptoClient._walletStandardRegister }
        }));

        const registries = [
            window['@wallet-standard:wallets'],
            window._standardWallets,
            window.navigator?.wallets
        ];

        registries.forEach(registry => {
            if (Array.isArray(registry)) {
                registry.forEach(CryptoClient._walletStandardRegister);
            } else if (registry?.get) {
                try {
                    const wallets = registry.get();
                    if (Array.isArray(wallets)) {
                        wallets.forEach(CryptoClient._walletStandardRegister);
                    }
                } catch (e) { /* ignore */ }
            }
        });
    }

    static getWalletStandardWallets() {
        CryptoClient.initWalletStandard();
        return CryptoClient._walletStandardWallets;
    }

    static findJupiterInStandard() {
        const wallets = CryptoClient.getWalletStandardWallets();
        if (Array.isArray(wallets)) {
            return wallets.find(w =>
                w.name?.toLowerCase().includes('jupiter') ||
                w.name === 'Jupiter' ||
                w.icon?.includes('jup')
            );
        }
        return null;
    }

    static isJupiterInstalled() {
        if (CryptoClient._jupiterWalletCache !== null) return true;
        if (window.jupiterWallet) return true;
        if (window.jupiter?.isJupiter) return true;
        if (window.solana?.isJupiter || window.solana?.isJupiterWallet) return true;

        const standardWallet = CryptoClient.findJupiterInStandard();
        if (standardWallet) {
            CryptoClient._jupiterWalletCache = standardWallet;
            return true;
        }

        if (window.wallets) {
            const jupWallet = window.wallets.find?.(w =>
                w.name?.toLowerCase().includes('jupiter')
            );
            if (jupWallet) {
                CryptoClient._jupiterWalletCache = jupWallet;
                return true;
            }
        }

        return false;
    }

    static getJupiterProvider() {
        if (CryptoClient._jupiterWalletCache?.features?.['standard:connect']) {
            return CryptoClient._jupiterWalletCache;
        }
        if (window.jupiterWallet) return window.jupiterWallet;
        if (window.jupiter?.isJupiter) return window.jupiter;
        if (window.solana?.isJupiter || window.solana?.isJupiterWallet) return window.solana;

        const standardWallet = CryptoClient.findJupiterInStandard();
        if (standardWallet) {
            CryptoClient._jupiterWalletCache = standardWallet;
            return standardWallet;
        }

        if (window.wallets) {
            const jupWallet = window.wallets.find?.(w =>
                w.name?.toLowerCase().includes('jupiter')
            );
            if (jupWallet) return jupWallet;
        }

        return null;
    }

    // ==================== CONSTRUCTOR & INIT ====================

    constructor(config = {}) {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        this.config = {
            contractAddress: config.contractAddress || null,
            apiUrl: config.apiUrl || (isLocal ? "http://localhost:5001/api" : "https://proofnetwork.lol/api"),
            apiKey: config.apiKey || null,
            appName: config.appName || "Breakout",
            onVerify: config.onVerify || null,
            mountTo: config.mountTo || null,
            theme: {
                primaryColor: config.theme?.primaryColor || '#47D7AC',
                accentColor: config.theme?.accentColor || '#34d399',
                ...config.theme
            }
        };

        this.state = {
            walletAddress: null,
            isConnected: false,
            isConnecting: false,
            activeWallet: null
        };

        this.injectStyles();
        this._updateScale();
        this.createHeaderButton();
        this.createWalletModal();
        this.createReconnectOverlay();

        this.elements = {
            overlay: document.getElementById('cc-wallet-modal'),
            headerBtn: document.getElementById('cc-header-btn'),
            reconnectOverlay: document.getElementById('cc-reconnect-overlay')
        };

        // Keep scale in sync with viewport changes
        const onResize = () => this._updateScale();
        window.addEventListener('resize', onResize);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

        this.solanaWeb3Ready = this.loadSolanaWeb3();
        this.init();
    }

    // ==================== STYLES ====================

    injectStyles() {
        if (document.getElementById('cc-wallet-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'cc-wallet-styles';
        styles.textContent = `
            :root {
                --cc-s: 1;
                --cc-bg-dark: #0a0a18;
                --cc-bg-panel: #1a1a2e;
                --cc-bg-elevated: #222238;
                --cc-border-hi: #4a4a5a;
                --cc-border-lo: #1a1a2a;
                --cc-text-primary: #ddd;
                --cc-text-dim: #888;
                --cc-text-muted: #555;
                --cc-accent-green: #4ade80;
                --cc-accent-red: #e94560;
                --cc-accent-cyan: #00d2ff;
            }

            .cc-modal-backdrop {
                position: fixed; inset: 0;
                background: rgba(0, 0, 0, 0.75);
                z-index: 99999; opacity: 0; visibility: hidden;
                transition: opacity 0.15s linear, visibility 0.15s linear;
                image-rendering: pixelated;
            }
            .cc-modal-backdrop.visible { opacity: 1; visibility: visible; }

            .cc-modal {
                position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%) scale(var(--cc-s));
                background: var(--cc-bg-dark);
                padding: 16px; width: 280px;
                max-height: calc(100vh - 48px);
                overflow-y: auto; z-index: 100000;
                opacity: 0; visibility: hidden;
                transition: opacity 0.15s linear, visibility 0.15s linear;
                font-family: monospace;
                border: none;
                box-shadow:
                    inset 1px 1px 0 var(--cc-border-hi),
                    inset -1px -1px 0 var(--cc-border-lo),
                    0 0 0 1px #000;
            }
            .cc-modal::-webkit-scrollbar { width: 4px; }
            .cc-modal::-webkit-scrollbar-track { background: var(--cc-bg-dark); }
            .cc-modal::-webkit-scrollbar-thumb { background: #333; }
            .cc-modal-backdrop.visible .cc-modal {
                opacity: 1; visibility: visible;
            }

            .cc-close-btn {
                position: absolute; top: 6px; right: 6px;
                width: 18px; height: 18px; border: none; padding: 0;
                background: var(--cc-bg-panel); cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                color: var(--cc-text-dim); font-family: monospace; font-size: 12px;
                box-shadow:
                    inset 1px 1px 0 var(--cc-border-hi),
                    inset -1px -1px 0 var(--cc-border-lo);
            }
            .cc-close-btn:hover { color: #fff; background: var(--cc-accent-red); }

            .cc-header { text-align: center; margin-bottom: 12px; }
            .cc-title {
                font-family: monospace; font-size: 12px; font-weight: bold;
                color: var(--cc-accent-red); text-transform: uppercase;
                letter-spacing: 2px; margin: 0 0 4px 0;
            }
            .cc-subtitle {
                font-family: monospace; font-size: 9px;
                color: var(--cc-text-dim); margin: 0;
            }

            .cc-header::after {
                content: ''; display: block; height: 1px;
                background: var(--cc-accent-red); margin-top: 8px; opacity: 0.4;
            }

            .cc-wallet-list { display: flex; flex-direction: column; gap: 6px; }
            .cc-wallet-btn {
                display: flex; align-items: center; gap: 8px; width: 100%;
                padding: 8px 10px; background: var(--cc-bg-panel);
                border: none; cursor: pointer;
                font-family: monospace;
                box-shadow:
                    inset 1px 1px 0 var(--cc-border-hi),
                    inset -1px -1px 0 var(--cc-border-lo);
            }
            .cc-wallet-btn:hover { background: var(--cc-bg-elevated); }
            .cc-wallet-btn:active { box-shadow: inset 1px 1px 0 var(--cc-border-lo), inset -1px -1px 0 var(--cc-border-hi); }
            .cc-wallet-btn.last-used { box-shadow: inset 1px 1px 0 var(--cc-border-hi), inset -1px -1px 0 var(--cc-border-lo), 0 0 0 1px rgba(74, 222, 128, 0.3); }
            .cc-wallet-btn.not-installed { opacity: 0.4; }
            .cc-wallet-icon {
                width: 24px; height: 24px; flex-shrink: 0;
                image-rendering: pixelated; image-rendering: crisp-edges;
            }
            .cc-wallet-info { flex: 1; text-align: left; min-width: 0; }
            .cc-wallet-name {
                font-family: monospace; font-size: 10px; font-weight: bold;
                color: var(--cc-text-primary); margin: 0; text-transform: uppercase;
            }
            .cc-wallet-status {
                font-family: monospace; font-size: 8px;
                color: var(--cc-text-muted); margin: 2px 0 0 0;
            }
            .cc-wallet-status.detected { color: var(--cc-accent-green); }
            .cc-wallet-arrow {
                color: var(--cc-text-muted); font-family: monospace;
                font-size: 10px; flex-shrink: 0;
            }
            .cc-wallet-btn:hover .cc-wallet-arrow { color: var(--cc-accent-cyan); }
            .cc-last-used-badge {
                font-family: monospace; font-size: 7px; font-weight: bold;
                color: var(--cc-accent-green);
                background: rgba(74, 222, 128, 0.1); padding: 2px 4px;
                text-transform: uppercase; flex-shrink: 0;
            }

            .cc-connected-view { text-align: center; }
            .cc-connected-wallet-info {
                display: flex; align-items: center; gap: 8px;
                padding: 8px 10px; background: var(--cc-bg-panel);
                margin-bottom: 8px;
                box-shadow:
                    inset 1px 1px 0 var(--cc-border-hi),
                    inset -1px -1px 0 var(--cc-border-lo);
            }
            .cc-connected-wallet-icon {
                width: 24px; height: 24px; flex-shrink: 0;
                image-rendering: pixelated; image-rendering: crisp-edges;
            }
            .cc-connected-wallet-details { flex: 1; text-align: left; min-width: 0; }
            .cc-connected-wallet-name {
                font-family: monospace; font-size: 10px; font-weight: bold;
                color: var(--cc-text-primary); margin: 0; text-transform: uppercase;
            }
            .cc-connected-wallet-address {
                font-family: monospace; font-size: 8px;
                color: var(--cc-text-dim); margin: 2px 0 0 0;
            }
            .cc-connected-wallet-dot {
                width: 6px; height: 6px; background: var(--cc-accent-green);
                flex-shrink: 0; animation: ccPulse 1.5s steps(2) infinite;
            }

            .cc-connected-footer { display: flex; gap: 6px; }
            .cc-disconnect-btn-small {
                flex: 1; font-family: monospace; font-size: 9px; font-weight: bold;
                color: var(--cc-accent-red); background: var(--cc-bg-panel);
                border: none; padding: 8px; cursor: pointer;
                text-transform: uppercase; letter-spacing: 1px;
                box-shadow:
                    inset 1px 1px 0 var(--cc-border-hi),
                    inset -1px -1px 0 var(--cc-border-lo);
            }
            .cc-disconnect-btn-small:hover { background: var(--cc-bg-elevated); }

            .cc-status {
                font-family: monospace; font-size: 8px;
                color: var(--cc-text-muted); text-align: center;
                margin-top: 8px; min-height: 12px;
            }
            .cc-status.error { color: var(--cc-accent-red); }
            .cc-status.success { color: var(--cc-accent-green); }

            .cc-header-container {
                display: inline-flex; align-items: center;
                position: fixed; top: 8px; right: 8px; z-index: 9999;
                transform: scale(var(--cc-s));
                transform-origin: top right;
            }
            .cc-header-btn {
                display: inline-flex; align-items: center; gap: 4px;
                padding: 4px 8px; background: var(--cc-bg-panel);
                border: none; color: var(--cc-text-primary);
                font-family: monospace; font-size: 9px; font-weight: bold;
                text-transform: uppercase; cursor: pointer;
                box-shadow:
                    inset 1px 1px 0 var(--cc-border-hi),
                    inset -1px -1px 0 var(--cc-border-lo);
            }
            .cc-header-btn:hover { background: var(--cc-bg-elevated); }
            .cc-header-btn:active { box-shadow: inset 1px 1px 0 var(--cc-border-lo), inset -1px -1px 0 var(--cc-border-hi); }
            .cc-header-btn.connected {
                background: var(--cc-bg-dark);
                box-shadow:
                    inset 1px 1px 0 var(--cc-border-hi),
                    inset -1px -1px 0 var(--cc-border-lo),
                    0 0 0 1px rgba(74, 222, 128, 0.25);
            }
            .cc-header-btn.connected:hover { background: var(--cc-bg-panel); }
            .cc-header-btn-dot {
                width: 4px; height: 4px; background: var(--cc-accent-green);
                display: none;
            }
            .cc-header-btn.connected .cc-header-btn-dot { display: block; }
            .cc-header-btn-icon { width: 12px; height: 12px; color: var(--cc-accent-cyan); }
            @keyframes ccPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

            .cc-reconnect-overlay {
                position: fixed; inset: 0; background: rgba(0,0,0,0.85);
                z-index: 99998;
                display: none; align-items: center; justify-content: center;
                flex-direction: column; gap: 8px;
            }
            .cc-reconnect-overlay.visible { display: flex; }
            .cc-reconnect-spinner {
                font-family: monospace; color: var(--cc-accent-cyan);
                font-size: calc(14px * var(--cc-s));
                animation: ccBlink 0.6s steps(2) infinite;
            }
            @keyframes ccBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
            .cc-reconnect-text {
                font-family: monospace;
                font-size: calc(10px * var(--cc-s));
                color: var(--cc-text-dim); text-transform: uppercase;
            }

            .cc-error-toast {
                position: fixed; bottom: 16px; left: 50%;
                transform: translateX(-50%) scale(var(--cc-s));
                transform-origin: bottom center;
                background: var(--cc-bg-dark); color: var(--cc-accent-red);
                padding: 8px 12px; font-family: monospace; font-size: 9px;
                z-index: 100001; max-width: 280px; text-align: center;
                cursor: pointer;
                box-shadow:
                    inset 1px 1px 0 var(--cc-accent-red),
                    inset -1px -1px 0 #600,
                    0 0 0 1px #000;
                animation: ccErrorSlideIn 0.15s linear forwards;
            }
            .cc-error-toast:hover { background: var(--cc-bg-panel); }
            .cc-error-toast-title {
                display: flex; align-items: center; gap: 4px;
                margin-bottom: 2px; font-weight: bold; text-transform: uppercase;
            }
            .cc-error-toast-title svg { display: none; }
            .cc-error-toast-message { font-size: 8px; color: var(--cc-text-dim); word-break: break-word; }
            @keyframes ccErrorSlideIn {
                0% { opacity: 0; transform: translateX(-50%) scale(var(--cc-s)) translateY(8px); }
                100% { opacity: 1; transform: translateX(-50%) scale(var(--cc-s)) translateY(0); }
            }
            @keyframes ccErrorSlideOut {
                0% { opacity: 1; transform: translateX(-50%) scale(var(--cc-s)) translateY(0); }
                100% { opacity: 0; transform: translateX(-50%) scale(var(--cc-s)) translateY(-4px); }
            }
        `;
        document.head.appendChild(styles);

        // Theme colors are built into the pixel art CSS variables
    }

    // Scale wallet UI to match the game's pixel scale
    _updateScale() {
        const vv = window.visualViewport;
        const sw = vv ? vv.width : window.innerWidth;
        const sh = vv ? vv.height : window.innerHeight;
        const short = Math.min(sw, sh);
        // Game virtual height is 270; scale wallet UI proportionally
        const s = Math.max(1.2, Math.min(3, short / 270));
        document.documentElement.style.setProperty('--cc-s', s.toFixed(2));
    }

    // ==================== UI CREATION ====================

    static _createWalletSvgIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'cc-header-btn-icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path1.setAttribute('d', 'M21 12V7H5a2 2 0 0 1 0-4h14v4');
        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'M3 5v14a2 2 0 0 0 2 2h16v-5');
        const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path3.setAttribute('d', 'M18 12a2 2 0 0 0 0 4h4v-4Z');

        svg.appendChild(path1);
        svg.appendChild(path2);
        svg.appendChild(path3);
        return svg;
    }

    createHeaderButton() {
        if (document.getElementById('cc-header-btn')) return;

        const container = document.createElement('div');
        container.className = 'cc-header-container';
        container.id = 'cc-header-container';

        const btn = document.createElement('button');
        btn.className = 'cc-header-btn';
        btn.id = 'cc-header-btn';

        const dot = document.createElement('span');
        dot.className = 'cc-header-btn-dot';

        const text = document.createElement('span');
        text.className = 'cc-header-btn-text';
        text.textContent = 'WALLET';

        btn.appendChild(dot);
        btn.appendChild(text);
        container.appendChild(btn);
        document.body.appendChild(container);

        btn.addEventListener('click', () => this.showOverlay());
    }

    createReconnectOverlay() {
        if (document.getElementById('cc-reconnect-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'cc-reconnect-overlay';
        overlay.id = 'cc-reconnect-overlay';

        const spinner = document.createElement('div');
        spinner.className = 'cc-reconnect-spinner';
        spinner.textContent = '...';

        const text = document.createElement('div');
        text.className = 'cc-reconnect-text';
        text.textContent = 'RECONNECTING';

        overlay.appendChild(spinner);
        overlay.appendChild(text);
        document.body.appendChild(overlay);
    }

    createWalletModal() {
        if (document.getElementById('cc-wallet-modal')) return;

        const backdrop = document.createElement('div');
        backdrop.id = 'cc-wallet-modal';
        backdrop.className = 'cc-modal-backdrop';

        const modal = document.createElement('div');
        modal.className = 'cc-modal';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'cc-close-btn';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.textContent = '\u00d7';
        closeBtn.addEventListener('click', () => this.hideOverlay());

        const header = document.createElement('div');
        header.className = 'cc-header';

        const title = document.createElement('h2');
        title.className = 'cc-title';
        title.textContent = 'CONNECT WALLET';

        const subtitle = document.createElement('p');
        subtitle.className = 'cc-subtitle';
        subtitle.textContent = 'SELECT JUPITER WALLET';

        header.appendChild(title);
        header.appendChild(subtitle);

        const walletList = document.createElement('div');
        walletList.className = 'cc-wallet-list';
        walletList.id = 'cc-wallet-list';

        const connectedView = document.createElement('div');
        connectedView.className = 'cc-connected-view';
        connectedView.id = 'cc-connected-view';
        connectedView.style.display = 'none';

        const status = document.createElement('div');
        status.className = 'cc-status';
        status.id = 'cc-status';

        modal.appendChild(closeBtn);
        modal.appendChild(header);
        modal.appendChild(walletList);
        modal.appendChild(connectedView);
        modal.appendChild(status);
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) this.hideOverlay();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && backdrop.classList.contains('visible')) {
                this.hideOverlay();
            }
        });
    }

    // ==================== WALLET DETECTION & RENDERING ====================

    getLastUsedWallet() {
        try { return localStorage.getItem(CryptoClient.STORAGE_KEY); } catch { return null; }
    }

    setLastUsedWallet(walletId) {
        try { localStorage.setItem(CryptoClient.STORAGE_KEY, walletId); } catch { /* */ }
    }

    detectWallets() {
        const wallets = [];
        const lastUsed = this.getLastUsedWallet();

        for (const [id, wallet] of Object.entries(CryptoClient.WALLETS)) {
            wallets.push({
                id, ...wallet,
                installed: wallet.isInstalled(),
                isLastUsed: id === lastUsed
            });
        }

        return wallets.sort((a, b) => {
            if (a.isLastUsed && !b.isLastUsed) return -1;
            if (!a.isLastUsed && b.isLastUsed) return 1;
            if (a.installed && !b.installed) return -1;
            if (!a.installed && b.installed) return 1;
            return a.name.localeCompare(b.name);
        });
    }

    renderWalletList() {
        const container = document.getElementById('cc-wallet-list');
        if (!container) return;

        container.replaceChildren();
        const wallets = this.detectWallets();

        wallets.forEach(wallet => {
            const btn = document.createElement('button');
            btn.className = 'cc-wallet-btn';
            if (wallet.isLastUsed) btn.classList.add('last-used');
            if (!wallet.installed) btn.classList.add('not-installed');
            btn.dataset.wallet = wallet.id;

            const icon = document.createElement('img');
            icon.className = 'cc-wallet-icon';
            icon.src = wallet.icon;
            icon.alt = wallet.name;

            const info = document.createElement('div');
            info.className = 'cc-wallet-info';

            const name = document.createElement('p');
            name.className = 'cc-wallet-name';
            name.textContent = wallet.name;

            const status = document.createElement('p');
            status.className = 'cc-wallet-status';
            if (wallet.installed) status.classList.add('detected');
            status.textContent = wallet.installed ? 'DETECTED' : 'NOT INSTALLED';

            info.appendChild(name);
            info.appendChild(status);
            btn.appendChild(icon);
            btn.appendChild(info);

            if (wallet.isLastUsed && wallet.installed) {
                const badge = document.createElement('span');
                badge.className = 'cc-last-used-badge';
                badge.textContent = 'PREV';
                btn.appendChild(badge);
            }

            const arrow = document.createElement('span');
            arrow.className = 'cc-wallet-arrow';
            arrow.textContent = '>';
            btn.appendChild(arrow);

            btn.addEventListener('click', () => {
                if (!wallet.installed) {
                    window.open(wallet.downloadUrl, '_blank');
                    return;
                }
                this.connectWallet(wallet.id);
            });

            container.appendChild(btn);
        });
    }

    renderConnectedView() {
        const container = document.getElementById('cc-connected-view');
        if (!container) return;

        container.replaceChildren();
        const walletConfig = CryptoClient.WALLETS[this.state.activeWallet];

        const walletInfo = document.createElement('div');
        walletInfo.className = 'cc-connected-wallet-info';

        if (walletConfig) {
            const icon = document.createElement('img');
            icon.className = 'cc-connected-wallet-icon';
            icon.src = walletConfig.icon;
            icon.alt = walletConfig.name;
            walletInfo.appendChild(icon);
        }

        const details = document.createElement('div');
        details.className = 'cc-connected-wallet-details';

        const name = document.createElement('div');
        name.className = 'cc-connected-wallet-name';
        name.textContent = walletConfig?.name || 'Wallet';

        const addr = document.createElement('div');
        addr.className = 'cc-connected-wallet-address';
        const pk = this.state.walletAddress || '';
        addr.textContent = pk.length > 12 ? `${pk.slice(0, 6)}...${pk.slice(-6)}` : pk;

        details.appendChild(name);
        details.appendChild(addr);
        walletInfo.appendChild(details);

        const dot = document.createElement('div');
        dot.className = 'cc-connected-wallet-dot';
        walletInfo.appendChild(dot);

        container.appendChild(walletInfo);

        const footer = document.createElement('div');
        footer.className = 'cc-connected-footer';

        const disconnectBtn = document.createElement('button');
        disconnectBtn.className = 'cc-disconnect-btn-small';
        disconnectBtn.textContent = 'DISCONNECT';
        disconnectBtn.addEventListener('click', () => this.disconnect());

        footer.appendChild(disconnectBtn);
        container.appendChild(footer);
    }

    // ==================== OVERLAY ====================

    showOverlay() {
        const backdrop = document.getElementById('cc-wallet-modal');
        const walletList = document.getElementById('cc-wallet-list');
        const connectedView = document.getElementById('cc-connected-view');
        const header = document.querySelector('.cc-header');
        const statusDiv = document.getElementById('cc-status');

        if (!backdrop) return;

        CryptoClient.announceWalletStandardReady();
        if (statusDiv) statusDiv.textContent = '';

        if (this.state.isConnected) {
            if (walletList) walletList.style.display = 'none';
            if (header) header.style.display = 'none';
            if (connectedView) {
                connectedView.style.display = 'block';
                this.renderConnectedView();
            }
        } else {
            if (connectedView) connectedView.style.display = 'none';
            if (header) header.style.display = '';
            if (walletList) walletList.style.display = 'flex';
            this.renderWalletList();
        }

        backdrop.classList.add('visible');
    }

    hideOverlay() {
        const backdrop = document.getElementById('cc-wallet-modal');
        if (backdrop) backdrop.classList.remove('visible');
    }

    updateStatus(message, isError = false) {
        const statusDiv = document.getElementById('cc-status');
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.className = 'cc-status';
            if (isError) statusDiv.classList.add('error');
            else if (message.toLowerCase().includes('connected')) statusDiv.classList.add('success');
        }
    }

    // ==================== INIT & LISTENERS ====================

    init() {
        CryptoClient.initWalletStandard();
        this.attachProviderListeners();
        this.listenForWalletStandard();
        this.autoReconnect();
        setTimeout(() => this.logDetectedWallets(), 100);
    }

    listenForWalletStandard() {
        window.addEventListener('wallet-standard:register-wallet', (event) => {
            const wallet = event.detail;
            if (wallet?.name?.toLowerCase().includes('jupiter')) {
                console.log('[CryptoClient] Jupiter wallet detected via Wallet Standard:', wallet.name);
                CryptoClient._jupiterWalletCache = wallet;
                if (this.elements.overlay?.classList.contains('visible')) {
                    this.renderWalletList();
                }
            }
        });

        setTimeout(() => {
            if (!CryptoClient._jupiterWalletCache && CryptoClient.isJupiterInstalled()) {
                console.log('[CryptoClient] Jupiter wallet found after delayed check');
            }
        }, 500);
    }

    logDetectedWallets() {
        const detected = [];
        for (const [id, config] of Object.entries(CryptoClient.WALLETS)) {
            if (config.isInstalled()) detected.push(config.name);
        }
        if (detected.length > 0) console.log('[CryptoClient] Detected wallets:', detected.join(', '));

        const standardWallets = CryptoClient.getWalletStandardWallets();
        if (standardWallets?.length > 0) {
            console.log('[CryptoClient] Wallet Standard wallets:', standardWallets.map(w => w.name).join(', '));
        }
    }

    attachProviderListeners() {
        if (this._providerListenersAttached) return;
        this._providerListenersAttached = true;

        for (const [walletId, walletConfig] of Object.entries(CryptoClient.WALLETS)) {
            const provider = walletConfig.getProvider();
            if (!provider || typeof provider.on !== 'function') continue;

            provider.on('connect', (publicKey) => {
                if (this.state.isConnecting) return;
                try {
                    const pk = publicKey?.toString?.() || provider.publicKey?.toString?.();
                    if (pk && this.state.activeWallet === walletId && !this.state.isConnected) {
                        this.onConnectSuccess(pk, walletId);
                    }
                } catch (e) { /* */ }
            });

            provider.on('disconnect', () => {
                if (this.state.activeWallet === walletId) this.disconnect();
            });

            provider.on('accountChanged', (publicKey) => {
                if (this.state.activeWallet !== walletId) return;
                const pk = publicKey?.toString?.() || null;
                if (!pk) { this.disconnect(); return; }
                this.state.walletAddress = pk;
                this.state.isConnected = true;
                this.updateHeaderButton(pk);
                document.dispatchEvent(new CustomEvent('walletConnected', {
                    detail: { publicKey: pk, wallet: walletId }
                }));
            });
        }
    }

    updateHeaderButton(publicKey) {
        const btn = this.elements.headerBtn || document.getElementById('cc-header-btn');
        if (btn) {
            const textSpan = btn.querySelector('.cc-header-btn-text');
            if (textSpan) textSpan.textContent = `${publicKey.slice(0, 4)}..${publicKey.slice(-4)}`;
            btn.classList.add('connected');
        }
    }

    resetHeaderButton() {
        const btn = this.elements.headerBtn || document.getElementById('cc-header-btn');
        if (btn) {
            const textSpan = btn.querySelector('.cc-header-btn-text');
            if (textSpan) textSpan.textContent = 'WALLET';
            btn.classList.remove('connected');
        }
    }

    async autoReconnect() {
        const lastWalletId = this.getLastUsedWallet();
        if (!lastWalletId) return;

        const walletConfig = CryptoClient.WALLETS[lastWalletId];
        if (!walletConfig || !walletConfig.isInstalled()) return;

        try {
            const provider = walletConfig.getProvider();
            if (!provider) return;

            const response = await provider.connect({ onlyIfTrusted: true });
            const publicKey = response?.publicKey?.toString?.() || provider.publicKey?.toString?.();

            if (publicKey) {
                this.state.walletAddress = publicKey;
                this.state.isConnected = true;
                this.state.activeWallet = lastWalletId;
                this.updateHeaderButton(publicKey);

                document.dispatchEvent(new CustomEvent('walletConnected', {
                    detail: { publicKey, wallet: lastWalletId }
                }));
                console.log(`[CryptoClient] Auto-reconnected via ${walletConfig.name}:`, publicKey);
            }
        } catch (error) {
            console.log('[CryptoClient] Auto-reconnect not available');
        }
    }

    // ==================== WALLET CONNECTION ====================

    async connectWallet(walletId = 'jupiter') {
        if (this.state.isConnecting) return;

        const walletConfig = CryptoClient.WALLETS[walletId];
        if (!walletConfig) { this.updateStatus('Unknown wallet', true); return; }

        if (!walletConfig.isInstalled()) {
            window.open(walletConfig.downloadUrl, '_blank');
            return;
        }

        const previousWallet = this.state.activeWallet;
        this.state.isConnecting = true;
        this.state.activeWallet = walletId;
        this.updateStatus(`Connecting to ${walletConfig.name}...`);

        const provider = walletConfig.getProvider();

        try {
            this.attachProviderListeners();

            if (this.state.isConnected && this.state.walletAddress && previousWallet === walletId) {
                this.onConnectSuccess(this.state.walletAddress, walletId);
                return;
            }

            const attemptConnect = async () => {
                if (provider.features?.['standard:connect']?.connect) {
                    const result = await provider.features['standard:connect'].connect();
                    if (result?.accounts?.length > 0) {
                        const account = result.accounts[0];
                        return {
                            publicKey: {
                                toString: () => account.address,
                                toBase58: () => account.address
                            }
                        };
                    }
                    return result;
                }

                try {
                    return await provider.connect({ onlyIfTrusted: false });
                } catch (err) {
                    if (typeof provider.request === 'function') {
                        return await provider.request({ method: 'connect' });
                    }
                    throw err;
                }
            };

            let response;
            try {
                response = await attemptConnect();
            } catch (err) {
                const code = err?.code ?? err?.data?.code;
                const msg = err?.message || String(err);
                if (code === -32603 || /unexpected error/i.test(msg)) {
                    this.updateStatus(`${walletConfig.name} internal error. Retrying...`, true);
                    try { await provider.disconnect(); } catch (_) {}
                    await new Promise(r => setTimeout(r, 250));
                    response = await attemptConnect();
                } else {
                    throw err;
                }
            }

            const publicKey = (
                response?.publicKey?.toString?.() ||
                provider.publicKey?.toString?.() ||
                response?.toString?.()
            );

            if (!publicKey) throw new Error('Failed to get public key from wallet');

            this.state.walletAddress = publicKey;

            if (this.config.onVerify) {
                this.updateStatus('Verifying wallet...');
                await this.config.onVerify(publicKey, provider);
            }

            this.setLastUsedWallet(walletId);
            this.onConnectSuccess(publicKey, walletId);

        } catch (error) {
            const code = error?.code ?? error?.data?.code;
            const rawMessage = error?.message || error?.toString?.() || 'Failed to connect';

            let friendly = rawMessage;
            if (code === 4001) friendly = 'Connection cancelled.';
            else if (code === -32002 || /pending/i.test(rawMessage))
                friendly = `A request is pending in ${walletConfig.name}. Please check your wallet.`;
            else if (code === -32603)
                friendly = `${walletConfig.name} returned an error. Try unlocking your wallet and reconnecting.`;

            console.error(`[CryptoClient] ${walletConfig.name} connection error:`, { code, rawMessage, error });
            this.updateStatus(friendly, true);
        } finally {
            this.state.isConnecting = false;
        }
    }

    onConnectSuccess(publicKey, walletId) {
        this.state.isConnected = true;
        this.state.activeWallet = walletId;
        this.updateStatus('Connected!', false);

        const walletName = CryptoClient.WALLETS[walletId]?.name || walletId;

        setTimeout(() => {
            this.hideOverlay();
            this.updateHeaderButton(publicKey);
            document.dispatchEvent(new CustomEvent('walletConnected', {
                detail: { publicKey, wallet: walletId, walletName }
            }));
        }, 600);

        console.log(`[CryptoClient] Connected via ${walletName}:`, publicKey);
    }

    disconnect() {
        if (this.state.activeWallet) {
            const walletConfig = CryptoClient.WALLETS[this.state.activeWallet];
            const provider = walletConfig?.getProvider();
            if (provider?.disconnect) {
                try { provider.disconnect(); } catch (_) {}
            }
        }

        this.state.isConnected = false;
        this.state.walletAddress = null;
        this.state.activeWallet = null;

        this.resetHeaderButton();
        this.updateStatus('');
        this.hideOverlay();

        document.dispatchEvent(new CustomEvent('walletDisconnected'));
        console.log('[CryptoClient] Disconnected');
    }

    getProvider() {
        if (!this.state.activeWallet) return null;
        return CryptoClient.WALLETS[this.state.activeWallet]?.getProvider();
    }

    // ==================== SOLANA WEB3 LOADING ====================

    static SYNDICA_RPC = 'https://mainnet.helius-rpc.com/?api-key=39ce0457-df99-4207-9036-882d82d30349';

    loadBufferBundle() {
        if (window.Buffer) return Promise.resolve(window.Buffer);

        const existing = document.querySelector('script[data-buffer-bundle]');
        if (existing && window.buffer) {
            window.Buffer = window.Buffer ?? window.buffer.Buffer;
            return Promise.resolve(window.Buffer);
        }

        return new Promise((resolve, reject) => {
            const script = existing || document.createElement('script');
            script.src = 'https://proofnetwork.lol/bufferbundle.js';
            script.async = true;
            script.dataset.bufferBundle = 'true';
            script.onload = () => {
                try {
                    window.Buffer = window.Buffer ?? window.buffer.Buffer;
                    resolve(window.Buffer);
                } catch (err) { reject(err); }
            };
            script.onerror = reject;
            if (!existing) document.head.appendChild(script);
        });
    }

    loadSolanaWeb3() {
        return this.loadBufferBundle().then(() => {
            if (window.solanaWeb3) {
                if (!window.solanaConnection) {
                    window.solanaConnection = new window.solanaWeb3.Connection(CryptoClient.SYNDICA_RPC);
                }
                return Promise.resolve(window.solanaWeb3);
            }

            const existing = document.querySelector('script[data-solana-web3]');
            if (existing && window.solanaWeb3) return Promise.resolve(window.solanaWeb3);

            return new Promise((resolve, reject) => {
                const script = existing || document.createElement('script');
                script.src = 'https://unpkg.com/@solana/web3.js@1.98.2/lib/index.iife.min.js';
                script.async = true;
                script.dataset.solanaWeb3 = 'true';
                script.onload = () => {
                    try {
                        window.solanaConnection = new window.solanaWeb3.Connection(CryptoClient.SYNDICA_RPC);
                        resolve(window.solanaWeb3);
                    } catch (err) { reject(err); }
                };
                script.onerror = reject;
                if (!existing) document.head.appendChild(script);
            });
        });
    }

    // ==================== CONTRACT CALLS ====================

    _pendingCalls = new Map();

    async callContract(functionName, inputs = {}, options = {}) {
        const { contractAddress } = this.config;
        const fromAddress = options.fromAddress || this.state.walletAddress || 'guest';
        const callKey = `${functionName}:${fromAddress}:${JSON.stringify(inputs)}`;

        if (this._pendingCalls.has(callKey)) {
            return this._pendingCalls.get(callKey);
        }

        const callPromise = this._executeContractCall(functionName, inputs, fromAddress, callKey);
        this._pendingCalls.set(callKey, callPromise);
        callPromise.finally(() => { this._pendingCalls.delete(callKey); });
        return callPromise;
    }

    async _executeContractCall(functionName, inputs, fromAddress, callKey) {
        const { contractAddress } = this.config;

        try {
            const response = await fetch(`${this.config.apiUrl}/blockchain/contracts/call`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({
                    from: fromAddress,
                    contractAddress,
                    functionName,
                    inputs,
                    responseMode: 'minimal'
                })
            });

            const result = await response.json();

            if (result.success === false && result.error) {
                const errorMsg = typeof result.error === 'string' ? result.error : result.error.message || 'Contract error';
                this.showErrorToast(errorMsg);
                throw new Error(errorMsg);
            }

            const isEncodedTransaction = (str) => {
                if (typeof str !== 'string') return false;
                if (str.length >= 200 && /^[A-Za-z0-9+/]+=*$/.test(str) && str.length % 4 === 0) return true;
                if (str.length >= 500 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(str)) return true;
                return false;
            };

            const findEncodedTransaction = (obj, depth = 0) => {
                if (depth > 5 || !obj) return null;
                if (typeof obj === 'string') return isEncodedTransaction(obj) ? obj : null;
                if (Array.isArray(obj)) {
                    for (const item of obj) {
                        const found = findEncodedTransaction(item, depth + 1);
                        if (found) return found;
                    }
                    return null;
                }
                if (typeof obj === 'object') {
                    const txFields = ['transaction', 'tx', 'signedTx', 'serializedTx', 'rawTransaction'];
                    for (const field of txFields) {
                        if (obj[field] && typeof obj[field] === 'string' && isEncodedTransaction(obj[field])) return obj[field];
                    }
                    for (const value of Object.values(obj)) {
                        const found = findEncodedTransaction(value, depth + 1);
                        if (found) return found;
                    }
                }
                return null;
            };

            if (!result.transaction) {
                if (result.outputs) {
                    const encodedTx = findEncodedTransaction(result.outputs);
                    if (encodedTx) result.outputs._encodedTransaction = encodedTx;
                    return result.outputs;
                }
                if (result.success !== undefined) {
                    const encodedTx = findEncodedTransaction(result);
                    if (encodedTx) result._encodedTransaction = encodedTx;
                    return result;
                }
                const errorMsg = result.error?.message || result.error || 'No response from contract';
                this.showErrorToast(errorMsg);
                throw new Error(errorMsg);
            }

            if (result.transaction.status === 'failed') {
                const errorMsg = result.transaction.errorMessage || result.error || 'Transaction failed';
                this.showErrorToast(errorMsg);
                throw new Error(errorMsg);
            }

            if (result.transaction.errorMessage) {
                this.showErrorToast(result.transaction.errorMessage);
                return result.transaction;
            }

            const outputs = result.transaction.outputs || result.transaction;
            const encodedTx = findEncodedTransaction(outputs);
            if (encodedTx && typeof outputs === 'object') outputs._encodedTransaction = encodedTx;
            return outputs;
        } catch (error) {
            console.error('[CryptoClient] Contract call error:', error);

            const isCorsError = error instanceof TypeError ||
                error.message?.toLowerCase().includes('cors') ||
                error.message?.toLowerCase().includes('network') ||
                error.message?.toLowerCase().includes('failed to fetch');

            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            if (isCorsError && !isLocalhost) {
                this.showReconnectingOverlay();
                setTimeout(() => this.hideReconnectingOverlay(), 3000);
            } else if (!isCorsError) {
                if (!document.querySelector('.cc-error-toast')) {
                    this.showErrorToast(error.message || 'Contract call failed');
                }
            }

            throw error;
        }
    }

    // ==================== TRANSACTION SIGNING ====================

    async signAndSendTransaction(transaction, options = {}) {
        let { callbacks = {} } = options;
        const actualCallbacks = callbacks.onSuccess ? callbacks : (options.onSuccess ? options : {});

        try { await this.solanaWeb3Ready; } catch (e) {
            console.error('[CryptoClient] Failed to load solanaWeb3:', e);
            return null;
        }

        const web3 = window.solanaWeb3;
        const provider = this.getProvider();

        if (!provider || !this.state.isConnected) {
            console.error('[CryptoClient] Wallet not connected');
            return null;
        }

        const connection = window.solanaConnection;

        const decodeTransaction = (str) => {
            const isLikelyBase64 = /[+/=]/.test(str);
            if (isLikelyBase64) {
                try { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); } catch { /* */ }
            }
            return new Uint8Array(CryptoClient.decodeBase58(str));
        };

        const deserializeTx = (txBytes) => {
            try {
                return { tx: web3.VersionedTransaction.deserialize(txBytes), isVersioned: true };
            } catch {
                return { tx: web3.Transaction.from(txBytes), isVersioned: false };
            }
        };

        try {
            if (typeof transaction === 'string') {
                const txBytes = decodeTransaction(transaction);
                const { tx: txObject, isVersioned } = deserializeTx(txBytes);

                const hasBlockhash = isVersioned ? txObject.message.recentBlockhash : txObject.recentBlockhash;
                if (!hasBlockhash) {
                    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
                    if (isVersioned) txObject.message.recentBlockhash = blockhash;
                    else { txObject.recentBlockhash = blockhash; txObject.lastValidBlockHeight = lastValidBlockHeight; }
                }

                let signature;

                if (typeof provider.signAndSendTransaction === 'function') {
                    const result = await provider.signAndSendTransaction(txObject);
                    signature = result.signature || result;
                } else if (provider.features?.['solana:signAndSendTransaction']?.signAndSendTransaction) {
                    const account = provider.accounts?.[0];
                    if (!account) throw new Error('No account found in wallet');
                    const serializedTx = txObject.serialize({ requireAllSignatures: false });
                    const result = await provider.features['solana:signAndSendTransaction'].signAndSendTransaction({
                        transaction: serializedTx, account, chain: 'solana:mainnet'
                    });
                    if (Array.isArray(result) && result.length > 0) {
                        signature = CryptoClient.encodeBase58(new Uint8Array(result[0].signature));
                    } else {
                        signature = result?.signature ? CryptoClient.encodeBase58(new Uint8Array(result.signature)) : result;
                    }
                } else if (provider.features?.['solana:signTransaction']?.signTransaction) {
                    const account = provider.accounts?.[0];
                    if (!account) throw new Error('No account found in wallet');
                    const serializedTx = txObject.serialize({ requireAllSignatures: false });
                    const result = await provider.features['solana:signTransaction'].signTransaction({
                        transaction: serializedTx, account, chain: 'solana:mainnet'
                    });
                    const signedTxBytes = Array.isArray(result) ? result[0].signedTransaction : result.signedTransaction;
                    signature = await connection.sendRawTransaction(signedTxBytes, {
                        skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3
                    });
                } else if (typeof provider.signTransaction === 'function') {
                    const signedTx = await provider.signTransaction(txObject);
                    signature = await connection.sendRawTransaction(signedTx.serialize(), {
                        skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3
                    });
                } else {
                    throw new Error('Wallet does not support transaction signing');
                }

                console.log('[CryptoClient] Transaction sent:', signature);
                if (actualCallbacks.onSuccess) actualCallbacks.onSuccess({ signature });
                return { signature, success: true };
            }

            if (Array.isArray(transaction)) {
                const transactions = transaction.map(txString => {
                    const txBytes = decodeTransaction(txString);
                    return deserializeTx(txBytes);
                });

                const needsBlockhash = transactions.some(({ tx, isVersioned }) => {
                    return !(isVersioned ? tx.message.recentBlockhash : tx.recentBlockhash);
                });

                if (needsBlockhash) {
                    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
                    for (const { tx, isVersioned } of transactions) {
                        if (!(isVersioned ? tx.message.recentBlockhash : tx.recentBlockhash)) {
                            if (isVersioned) tx.message.recentBlockhash = blockhash;
                            else { tx.recentBlockhash = blockhash; tx.lastValidBlockHeight = lastValidBlockHeight; }
                        }
                    }
                }

                const signatures = [];
                const txObjects = transactions.map(item => item.tx);

                if (typeof provider.signAllTransactions === 'function') {
                    const signedTransactions = await provider.signAllTransactions(txObjects);
                    for (const signedTx of signedTransactions) {
                        let sig;
                        if (typeof provider.sendTransaction === 'function') {
                            const result = await provider.sendTransaction(signedTx);
                            sig = result.signature || result;
                        } else {
                            sig = await connection.sendRawTransaction(signedTx.serialize());
                        }
                        signatures.push(sig);
                    }
                } else if (typeof provider.signAndSendTransaction === 'function') {
                    for (const tx of txObjects) {
                        const result = await provider.signAndSendTransaction(tx);
                        signatures.push(result.signature || result);
                    }
                } else if (provider.features?.['solana:signAndSendTransaction']?.signAndSendTransaction) {
                    const account = provider.accounts?.[0];
                    if (!account) throw new Error('No account found in wallet');
                    for (const tx of txObjects) {
                        const serializedTx = tx.serialize({ requireAllSignatures: false });
                        const result = await provider.features['solana:signAndSendTransaction'].signAndSendTransaction({
                            transaction: serializedTx, account, chain: 'solana:mainnet'
                        });
                        let sig;
                        if (Array.isArray(result) && result.length > 0) {
                            sig = CryptoClient.encodeBase58(new Uint8Array(result[0].signature));
                        } else {
                            sig = result?.signature ? CryptoClient.encodeBase58(new Uint8Array(result.signature)) : result;
                        }
                        signatures.push(sig);
                    }
                } else {
                    throw new Error('Wallet does not support transaction signing');
                }

                if (actualCallbacks.onSuccess) actualCallbacks.onSuccess({ signature: signatures[0], signatures });
                return { signature: signatures[0], signatures, success: true };
            }

            throw new Error('Invalid transaction format');
        } catch (error) {
            console.error('[CryptoClient] Transaction error:', error);
            if (callbacks.onError) callbacks.onError(error);
            return null;
        }
    }

    // ==================== MESSAGE SIGNING ====================

    async signMessage(message, encoding = 'utf8') {
        const provider = this.getProvider();
        if (!provider || !this.state.isConnected) return null;

        try {
            const encodedMessage = encoding === 'hex'
                ? new Uint8Array(message.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
                : new TextEncoder().encode(message);

            let signature, publicKey;

            if (provider.features?.['solana:signMessage']?.signMessage) {
                const result = await provider.features['solana:signMessage'].signMessage({
                    message: encodedMessage,
                    account: provider.accounts?.[0]
                });
                if (Array.isArray(result) && result.length > 0) {
                    signature = result[0].signature || result[0].signedMessage || result[0];
                } else {
                    signature = result?.signature || result?.signedMessage || result;
                }
                publicKey = provider.accounts?.[0]?.address || this.state.walletAddress;
            } else {
                const result = await provider.signMessage(encodedMessage, 'utf8');
                signature = result.signature;
                publicKey = result.publicKey;
            }

            let signatureArray;
            if (signature instanceof Uint8Array) signatureArray = Array.from(signature);
            else if (Array.isArray(signature)) signatureArray = signature;
            else if (signature?.buffer) signatureArray = Array.from(new Uint8Array(signature.buffer));
            else signatureArray = [];

            const pubKeyStr = typeof publicKey === 'string' ? publicKey : publicKey?.toString?.() || this.state.walletAddress;
            const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
            const signatureBase58 = CryptoClient.encodeBase58(new Uint8Array(signatureArray));

            return {
                signature: signatureArray,
                signatureBase58,
                signatureBase64,
                signatureHex: signatureArray.map(b => b.toString(16).padStart(2, '0')).join(''),
                publicKey: pubKeyStr,
                message
            };
        } catch (error) {
            const msg = error?.message || '';
            if (/user rejected|user declined/i.test(msg)) {
                console.log('[CryptoClient] Message signing cancelled by user');
            } else {
                console.error('[CryptoClient] Message signing error:', error);
            }
            return null;
        }
    }

    // ==================== POLLING ====================

    pollContract(functionName, inputs = {}, frequency = 2000, onUpdate, options = {}) {
        const maxErrors = options.maxErrors ?? 4;
        let isPolling = true;
        let consecutiveErrors = 0;

        const poll = async () => {
            if (!isPolling) return;
            try {
                const resolvedInputs = typeof inputs === 'function' ? inputs() : inputs;
                if (resolvedInputs.hasOwnProperty('walletAddress') && !resolvedInputs.walletAddress) {
                    resolvedInputs.walletAddress = this.state.walletAddress;
                }
                const data = await this.callContract(functionName, resolvedInputs);
                consecutiveErrors = 0;
                if (isPolling) onUpdate(data);
            } catch (e) {
                consecutiveErrors++;
                if (consecutiveErrors >= maxErrors) {
                    isPolling = false;
                    if (options.onMaxErrors) options.onMaxErrors(e);
                    return;
                }
            }
            if (isPolling) setTimeout(poll, frequency);
        };

        poll();
        return { stop: () => { isPolling = false; }, isActive: () => isPolling };
    }

    // ==================== UTILITIES ====================

    showErrorToast(message, duration = 5000) {
        const existing = document.querySelector('.cc-error-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'cc-error-toast';

        const title = document.createElement('div');
        title.className = 'cc-error-toast-title';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '10');
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', '12'); line1.setAttribute('y1', '8'); line1.setAttribute('x2', '12'); line1.setAttribute('y2', '12');
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', '12'); line2.setAttribute('y1', '16'); line2.setAttribute('x2', '12.01'); line2.setAttribute('y2', '16');

        svg.appendChild(circle); svg.appendChild(line1); svg.appendChild(line2);

        const titleText = document.createElement('span');
        titleText.textContent = '! ERROR';
        title.appendChild(svg); title.appendChild(titleText);

        const msg = document.createElement('div');
        msg.className = 'cc-error-toast-message';
        msg.textContent = message;

        toast.appendChild(title); toast.appendChild(msg);
        toast.addEventListener('click', () => {
            toast.style.animation = 'ccErrorSlideOut 0.2s ease forwards';
            setTimeout(() => toast.remove(), 200);
        });

        document.body.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    toast.style.animation = 'ccErrorSlideOut 0.2s ease forwards';
                    setTimeout(() => toast.remove(), 200);
                }
            }, duration);
        }
    }

    showReconnectingOverlay() {
        const overlay = this.elements.reconnectOverlay || document.getElementById('cc-reconnect-overlay');
        if (overlay) overlay.classList.add('visible');
    }

    hideReconnectingOverlay() {
        const overlay = this.elements.reconnectOverlay || document.getElementById('cc-reconnect-overlay');
        if (overlay) overlay.classList.remove('visible');
    }

    async fetchTokenPrice(tokenMint) {
        if (!tokenMint) return null;
        try {
            const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
            if (!response.ok) throw new Error(`DexScreener API error: ${response.status}`);
            const data = await response.json();

            if (data.pairs && data.pairs.length > 0) {
                const sortedPairs = data.pairs.sort((a, b) =>
                    parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
                );
                const bestPair = sortedPairs[0];
                return {
                    priceUsd: parseFloat(bestPair.priceUsd || 0),
                    priceNative: parseFloat(bestPair.priceNative || 0),
                    priceChange24h: parseFloat(bestPair.priceChange?.h24 || 0),
                    liquidity: parseFloat(bestPair.liquidity?.usd || 0),
                    volume24h: parseFloat(bestPair.volume?.h24 || 0),
                    dexId: bestPair.dexId,
                    pairAddress: bestPair.pairAddress
                };
            }
            return null;
        } catch (error) {
            console.error('[CryptoClient] Error fetching token price:', error);
            return null;
        }
    }

    static encodeBase58(bytes) {
        const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let result = '';
        let num = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''));
        while (num > 0n) {
            const mod = num % 58n;
            result = ALPHABET[Number(mod)] + result;
            num = num / 58n;
        }
        for (const byte of bytes) {
            if (byte === 0) result = '1' + result;
            else break;
        }
        return result;
    }

    static decodeBase58(str) {
        const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const ALPHABET_MAP = {};
        for (let i = 0; i < ALPHABET.length; i++) ALPHABET_MAP[ALPHABET[i]] = BigInt(i);

        let num = 0n;
        for (const char of str) {
            if (!(char in ALPHABET_MAP)) throw new Error('Invalid base58 character: ' + char);
            num = num * 58n + ALPHABET_MAP[char];
        }

        let hex = num.toString(16);
        if (hex.length % 2) hex = '0' + hex;

        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));

        for (const char of str) {
            if (char === '1') bytes.unshift(0);
            else break;
        }

        return new Uint8Array(bytes);
    }

    encodeBase58(bytes) { return CryptoClient.encodeBase58(bytes); }
    decodeBase58(str) { return CryptoClient.decodeBase58(str); }
}

// Expose globally so ES modules (main.js) can access it
window.CryptoClient = CryptoClient;
