import { useState, useEffect } from 'react';

type SdkState = 'idle' | 'loading' | 'loaded' | 'error';

let state: SdkState = 'idle';
const listeners: Array<(loaded: boolean) => void> = [];

export function useKakaoSdk(): boolean {
  const [loaded, setLoaded] = useState(state === 'loaded');

  useEffect(() => {
    if (state === 'loaded') {
      setLoaded(true);
      return;
    }

    const notify = (v: boolean) => setLoaded(v);
    listeners.push(notify);

    if (state === 'idle') {
      state = 'loading';
      const appKey = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
      if (!appKey) {
        console.error('[KakaoSDK] VITE_KAKAO_JS_KEY is not set');
        state = 'error';
        listeners.forEach((fn) => fn(false));
        listeners.length = 0;
        return;
      }

      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=services&autoload=false`;
      script.async = true;
      script.onload = () => {
        console.log('[KakaoSDK] script loaded, calling kakao.maps.load()...');
        kakao.maps.load(() => {
          console.log('[KakaoSDK] kakao.maps.load() callback fired — SDK ready');
          state = 'loaded';
          listeners.forEach((fn) => fn(true));
          listeners.length = 0;
        });
      };
      script.onerror = () => {
        console.error('[KakaoSDK] script load failed');
        state = 'error';
        listeners.forEach((fn) => fn(false));
        listeners.length = 0;
      };
      document.head.appendChild(script);
    }

    return () => {
      const idx = listeners.indexOf(notify);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);

  return loaded;
}
