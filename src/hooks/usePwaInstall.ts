import React, { useState, useEffect } from 'react';
import { toast } from '../utils';

export function usePwaInstall() {
    const [pwaInstallable, setPwaInstallable] = useState(false);
    const [pwaInstalled, setPwaInstalled]     = useState(false);

    useEffect(()=>{
        if(window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone){
            setPwaInstalled(true);
        }
        const onInstallable = () => setPwaInstallable(true);
        const onInstalled   = () => { setPwaInstallable(false); setPwaInstalled(true); toast('✅ تم تثبيت التطبيق على شاشتك!'); };
        window.addEventListener('pwa-installable', onInstallable);
        window.addEventListener('pwa-installed',   onInstalled);
        if(window.__pwaInstallPrompt) setPwaInstallable(true);
        return ()=>{
            window.removeEventListener('pwa-installable', onInstallable);
            window.removeEventListener('pwa-installed',   onInstalled);
        };
    },[]);

    const handlePwaInstall = async () => {
        if(!window.__pwaInstallPrompt){ toast('افتح التطبيق من Chrome أو Edge للتثبيت',true); return; }
        window.__pwaInstallPrompt.prompt();
        const {outcome} = await window.__pwaInstallPrompt.userChoice;
        if(outcome==='accepted'){ window.__pwaInstallPrompt=null; setPwaInstallable(false); }
    };

  return { pwaInstallable, pwaInstalled, handlePwaInstall };
}
