import { useCallback, useEffect } from 'react';

export const useSpeechSynthesis = () => {
  const speak = useCallback((text: string, lang = 'fa-IR') => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('Speech synthesis not supported in this browser.');
      return;
    }

    // Cancel any ongoing speech to prevent overlap
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;

    // The 'voiceschanged' event is fired when the list of voices is ready.
    // We need to wait for it to select a specific voice.
    const setVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const persianVoice = voices.find(voice => voice.lang === 'fa-IR');
        if (persianVoice) {
            utterance.voice = persianVoice;
        }
        window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener('voiceschanged', setVoice);
    } else {
        setVoice();
    }

  }, []);

  // Effect to ensure voices are loaded initially.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  return { speak };
};
