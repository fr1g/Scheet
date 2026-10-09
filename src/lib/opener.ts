import * as _opener from '@tauri-apps/plugin-opener';

export const Opener = {
    openInDefaultBrowserExpl: (fullUrl: string): Promise<void> | null => {
        if (fullUrl.length === 0) return null;
        return _opener.openUrl(fullUrl);
    }
}

export default Opener;
